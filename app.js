const express = require('express');
const path = require('path');
const fetch = require('node-fetch'); // Add this back

const app = express();
const PORT = 3001;

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

app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});