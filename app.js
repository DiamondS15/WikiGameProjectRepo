const express = require('express');
const path = require('path');
const fetch = require('node-fetch'); // Add this back

const app = express();
const PORT = 3001;

const topicClusters = {
    'Science': ['Physics', 'Chemistry', 'Biology', 'Astronomy', 'Mathematics'],
    'History': ['Ancient History', 'Medieval History', 'World War II', 'Civilizations'],
    'Art': ['Painting', 'Sculpture', 'Renaissance Art', 'Modern Art'],
    'Music': ['Classical Music', 'Rock Music', 'Jazz', 'Musicians'],
    'Technology': ['Computers', 'Internet', 'Programming', 'Artificial Intelligence'],
    'Philosophy': ['Ethics', 'Metaphysics', 'Epistemology', 'Logic'],
    'Literature': ['Novels', 'Poetry', 'Writers', 'Literary Movements'],
    'Sports': ['Olympic Games', 'Football', 'Basketball', 'Athletes']
};

// Serve static files
app.use(express.static('public'));

// Simple route
app.get('/', (req, res) => {
    res.send('Server is working! Go to <a href="/singleplayer.html">/singleplayer.html</a>');
});

// REAL Wikipedia API endpoint
app.get('/api/random-article', async (req, res) => {
    try {
        const response = await fetch(
            'https://en.wikipedia.org/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=1&origin=*'
        );
        const data = await response.json();
        const title = data.query.random[0].title;
        res.json({ title });
    } catch (error) {
        console.error('Error:', error);
        // Fallback to fake articles if Wikipedia fails
        const articles = ['Philosophy', 'Science', 'History', 'Art', 'Music'];
        const random = articles[Math.floor(Math.random() * articles.length)];
        res.json({ title: random });
    }
});

// Add article content endpoint
app.get('/api/article/:title', async (req, res) => {
    try {
        const title = req.params.title;
        // Double-decode the title to handle any encoded characters
        const decodedTitle = decodeURIComponent(title);

        const response = await fetch(
            `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&format=json&prop=text&origin=*`
        );
        const data = await response.json();

        if (data.error) {
            return res.status(404).json({ error: 'Article not found' });
        }

        res.json({
            title: data.parse.title,
            content: data.parse.text['*']
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to fetch article' });
    }
});

app.get('/api/related-article-simple/:title', async (req, res) => {
    // For now, just pick from the same cluster based on first letter
    // You can expand this logic
    const categories = Object.keys(topicClusters);
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const topics = topicClusters[randomCategory];
    const related = topics[Math.floor(Math.random() * topics.length)];
    res.json({ title: related });
});

app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});
// Improved best-link endpoint - FIRST CHECK ALL ACTUAL LINKS
app.get('/api/best-link', async (req, res) => {
    try {
        const { current, goal } = req.query;

        if (!current || !goal) {
            return res.status(400).json({ error: 'Missing current or goal article' });
        }

        console.log(`Finding best link from "${current}" to "${goal}"`);

        // Get the current article to extract its links
        const currentResponse = await fetch(
            `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(current)}&format=json&prop=links&origin=*`
        );
        const currentData = await currentResponse.json();

        if (!currentData.parse || !currentData.parse.links) {
            return res.json({ bestLink: null, message: 'Could not analyze article links' });
        }

        // Get all links from the current article
        const links = currentData.parse.links
            .filter(link => link.ns === 0)
            .map(link => link['*']);

        console.log(`Found ${links.length} links in current article`);

        if (links.length === 0) {
            return res.json({ bestLink: null, message: 'No links found in this article' });
        }

        // FIRST PRIORITY: Check if the goal article is directly linked
        const goalLower = goal.toLowerCase();

        // Check for exact match first (case-insensitive)
        for (const link of links) {
            if (link.toLowerCase() === goalLower) {
                console.log(`✓ DIRECT MATCH FOUND: "${link}" IS YOUR GOAL!`);
                return res.json({
                    bestLink: link,
                    message: `"${link}" - THIS IS YOUR GOAL! Click it to win!`,
                    directMatch: true,
                    isGoal: true
                });
            }
        }

        // Check for partial matches (like "Poetry" appearing anywhere in link text)
        const goalWords = goalLower.split(' ');
        for (const link of links) {
            const linkLower = link.toLowerCase();

            // Check if any goal word appears in the link
            for (const word of goalWords) {
                if (word.length > 3 && linkLower.includes(word)) {
                    console.log(`PARTIAL MATCH FOUND: "${link}" contains "${word}"`);
                    return res.json({
                        bestLink: link,
                        message: `"${link}" - contains "${word}" which relates to your goal "${goal}"`,
                        partialMatch: true
                    });
                }
            }

            // Check for singular/plural variations
            if (linkLower === goalLower + 's' || linkLower + 's' === goalLower) {
                console.log(`PLURAL MATCH FOUND: "${link}" matches "${goal}"`);
                return res.json({
                    bestLink: link,
                    message: `"${link}" - matches your goal "${goal}"`,
                    pluralMatch: true
                });
            }
        }

        // SECOND PRIORITY: If no direct match, look for related topics
        // Group links by relevance
        const scoredLinks = [];

        for (const link of links) {
            let score = 0;
            let reasons = [];

            // Check if link shares words with goal
            for (const word of goalWords) {
                if (word.length > 3 && link.toLowerCase().includes(word)) {
                    score += 30;
                    reasons.push(`contains "${word}"`);
                }
            }

            // Check if link is in same category as goal
            if (goal === 'Poetry') {
                // Poetry-related terms
                const poetryTerms = ['poet', 'poem', 'literature', 'verse', 'rhyme', 'sonnet'];
                for (const term of poetryTerms) {
                    if (link.toLowerCase().includes(term)) {
                        score += 20;
                        reasons.push(`related to poetry`);
                        break;
                    }
                }
            }

            if (score > 0) {
                scoredLinks.push({
                    title: link,
                    score: score,
                    reason: reasons.join(', ')
                });
            }
        }

        // Sort by score and return best
        if (scoredLinks.length > 0) {
            scoredLinks.sort((a, b) => b.score - a.score);
            const best = scoredLinks[0];

            res.json({
                bestLink: best.title,
                message: `"${best.title}" - ${best.reason || 'related to your goal'}`,
                alternatives: scoredLinks.slice(0, 3).map(l => l.title)
            });
        } else {
            // Last resort: pick a random link
            const randomLink = links[Math.floor(Math.random() * links.length)];
            res.json({
                bestLink: randomLink,
                message: `Try "${randomLink}" - no clearly related links found`,
                isRandom: true
            });
        }

    } catch (error) {
        console.error('Error finding best link:', error);
        res.status(500).json({ error: 'Failed to analyze links' });
    }
});