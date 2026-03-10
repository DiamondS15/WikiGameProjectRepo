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
// Improved best-link endpoint with 2-step lookahead
app.get('/api/best-link', async (req, res) => {
    try {
        const { current, goal } = req.query;

        if (!current || !goal) {
            return res.status(400).json({ error: 'Missing current or goal article' });
        }

        console.log(`Finding best link from "${current}" to "${goal}"`);

        // Handle singular/plural variations
        const goalLower = goal.toLowerCase();
        const goalVariations = [
            goalLower,
            goalLower.replace(/s$/, ''),  // Remove trailing s (plural to singular)
            goalLower + 's',                // Add s (singular to plural)
            goalLower.replace(/ies$/, 'y'), // Handle words ending in "ies" (e.g., "cities" -> "city")
            goalLower.replace(/y$/, 'ies')  // Handle words ending in "y" (e.g., "city" -> "cities")
        ];

        // Remove duplicates
        const uniqueGoalVariations = [...new Set(goalVariations)];
        console.log('Goal variations:', uniqueGoalVariations);

        // Get the current article to extract its links
        const currentResponse = await fetch(
            `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(current)}&format=json&prop=links&origin=*`
        );
        const currentData = await currentResponse.json();

        if (!currentData.parse || !currentData.parse.links) {
            return res.json({ bestLink: null, message: 'Could not analyze article links' });
        }

        // Get all links from the current article (filter to main namespace only)
        const links = currentData.parse.links
            .filter(link => link.ns === 0) // Only main namespace articles
            .map(link => link['*']);

        console.log(`Found ${links.length} links in current article`);

        if (links.length === 0) {
            return res.json({ bestLink: null, message: 'No links found in this article' });
        }

        // Check for goal variations in links
        for (const variation of uniqueGoalVariations) {
            if (links.includes(variation)) {
                return res.json({
                    bestLink: variation,
                    message: `Click "${variation}" - it's your goal!`,
                    directMatch: true
                });
            }
        }

        // SCORING SYSTEM WITH 2-STEP LOOKAHEAD - ONLY RELEVANT LINKS
        const linkScores = [];
        const linksToCheck = links.slice(0, 10); // Check first 10 links (to avoid rate limiting)

        for (const link of linksToCheck) {
            try {
                // Small delay to avoid hitting Wikipedia too hard
                await new Promise(resolve => setTimeout(resolve, 200));

                // Get the links within THIS link (second-level links)
                const linkResponse = await fetch(
                    `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(link)}&format=json&prop=links&origin=*`
                );
                const linkData = await linkResponse.json();

                let score = 0;
                let reason = '';

                if (linkData.parse && linkData.parse.links) {
                    const secondLevelLinks = linkData.parse.links
                        .filter(l => l.ns === 0)
                        .map(l => l['*']);

                    // Check for goal variations in second-level links
                    for (const variation of uniqueGoalVariations) {
                        if (secondLevelLinks.includes(variation)) {
                            score = 100;
                            reason = `leads to "${variation}" in just 2 steps!`;
                            break;
                        }
                    }

                    // If no direct 2-step path, check for goal-related terms
                    if (score === 0) {
                        const goalWords = goal.toLowerCase().split(' ');
                        let relevance = 0;

                        for (const word of goalWords) {
                            if (word.length > 3) {
                                // Check second-level links for goal-related terms
                                const matchingSecondLevel = secondLevelLinks.filter(t =>
                                    t.toLowerCase().includes(word)
                                ).length;
                                relevance += matchingSecondLevel * 15;

                                // Also check the link title itself for goal-related terms
                                if (link.toLowerCase().includes(word)) {
                                    relevance += 10;
                                }
                            }
                        }

                        // CATEGORY-BASED SCORING
                        const scienceTerms = ['science', 'technology', 'computer', 'ai', 'artificial', 'intelligence',
                            'math', 'physics', 'biology', 'chemistry', 'engineering'];

                        for (const term of scienceTerms) {
                            if (link.toLowerCase().includes(term)) {
                                relevance += 20;
                                reason = 'leads toward science/technology topics';
                                break;
                            }
                        }

                        if (relevance > 0) {
                            score = Math.min(90, relevance);
                            if (!reason) reason = 'related to your goal';
                        }
                    }
                }

                // IMPORTANT CHANGE: Only include links with actual relevance
                // No more "available to explore" fallback
                if (score > 0) {
                    linkScores.push({
                        title: link,
                        score: score,
                        reason: reason || 'related to your goal'
                    });
                } else {
                    console.log(`Skipping unrelevant link: ${link}`);
                }

            } catch (e) {
                console.log(`Error checking link ${link}:`, e.message);
                // Don't include links that error out
            }
        }

        // Sort by score and get the best
        linkScores.sort((a, b) => b.score - a.score);

        if (linkScores.length > 0) {
            const best = linkScores[0];
            const message = best.score >= 100
                ? `"${best.title}" ${best.reason}`
                : `"${best.title}" - ${best.reason || 'related to your goal'}`;

            res.json({
                bestLink: best.title,
                score: best.score,
                message: message,
                alternatives: linkScores.slice(0, 3).map(l => l.title)
            });
        } else {
            // No relevant links found - honest message
            res.json({
                bestLink: null,
                message: "No clearly relevant links found. Try exploring different paths!",
                alternatives: []
            });
        }

    } catch (error) {
        console.error('Error finding best link:', error);
        res.status(500).json({ error: 'Failed to analyze links' });
    }
});