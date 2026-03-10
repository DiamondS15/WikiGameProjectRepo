class WikiGame {
    constructor() {
        this.score = 1000;
        this.moves = 0;
        this.startTime = null;
        this.timerInterval = null;
        this.currentArticle = null;
        this.goalArticle = null;

        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        await this.startNewGame();
        this.setupEventListeners();
        this.startTimer();
    }

    async startNewGame() {
        try {
            this.score = 1000;
            this.moves = 0;
            this.startTime = Date.now();

            // Get random start article
            const startResponse = await fetch('/api/random-article');
            const startData = await startResponse.json();
            this.currentArticle = startData.title;

            // Get RELATED goal article using the simple endpoint
            const relatedResponse = await fetch('/api/related-article-simple/' + encodeURIComponent(this.currentArticle));
            const relatedData = await relatedResponse.json();
            this.goalArticle = relatedData.title;

            // Make sure they're different (just in case)
            if (this.goalArticle === this.currentArticle) {
                // If same, try one more time
                const relatedResponse2 = await fetch('/api/related-article-simple/' + encodeURIComponent(this.currentArticle));
                const relatedData2 = await relatedResponse2.json();
                this.goalArticle = relatedData2.title;
            }

            // After setting the goal article, check if current and goal are the same
            if (this.currentArticle.toLowerCase() === this.goalArticle.toLowerCase() ||
                this.currentArticle.toLowerCase() + 's' === this.goalArticle.toLowerCase() ||
                this.currentArticle.toLowerCase() === this.goalArticle.toLowerCase() + 's') {
                console.log('Start and goal are the same article! You win!');
                this.endGame(true);
                return;
            }

            // Update UI
            const currentTitleEl = document.getElementById('current-title');
            const goalTitleEl = document.getElementById('goal-title');

            if (currentTitleEl) {
                currentTitleEl.innerHTML = 'Current: <span class="text-muted">' + this.currentArticle + '</span>';
            }
            if (goalTitleEl) {
                goalTitleEl.textContent = this.goalArticle;
            }

            this.updateUI();
            await this.loadArticle(this.currentArticle);

            // Log for debugging
            console.log('Game started! From "' + this.currentArticle + '" to "' + this.goalArticle + '"');

        } catch (error) {
            console.error('Failed to start game:', error);
            alert('Failed to start game. Please try again.');
        }
    }
    highlightSuggestedLink(linkTitle) {
        // Wait a moment for the article to fully load
        setTimeout(() => {
            // Find all game links
            const links = document.querySelectorAll('.wiki-game-link');
            let found = false;
            let targetLink = null;

            // Remove any existing highlights
            links.forEach(l => {
                l.style.backgroundColor = '';
                l.style.fontWeight = '';
                l.style.border = '';
                l.style.boxShadow = '';
            });

            // Find and highlight the suggested link
            links.forEach(link => {
                if (link.dataset.title === linkTitle) {
                    link.style.backgroundColor = '#fff3cd';
                    link.style.fontWeight = 'bold';
                    link.style.border = '2px solid #ffc107';
                    link.style.boxShadow = '0 0 10px rgba(255, 193, 7, 0.5)';
                    link.style.padding = '2px 4px';
                    link.style.transition = 'all 0.3s ease';

                    targetLink = link;
                    found = true;
                }
            });

            if (found && targetLink) {
                // SCROLL TO THE LINK
                targetLink.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });

                // Add a pulsing animation class
                targetLink.classList.add('hint-pulse');

                // Log for debugging
                console.log('Scrolling to:', linkTitle);

                // Remove highlight after 8 seconds
                setTimeout(() => {
                    targetLink.style.backgroundColor = '';
                    targetLink.style.fontWeight = '';
                    targetLink.style.border = '';
                    targetLink.style.boxShadow = '';
                    targetLink.style.padding = '';
                    targetLink.classList.remove('hint-pulse');
                }, 8000);
            } else {
                console.log('Could not find link to highlight:', linkTitle);

                // If not found, try again after a longer delay (article might still be rendering)
                setTimeout(() => {
                    const retryLinks = document.querySelectorAll('.wiki-game-link');
                    retryLinks.forEach(link => {
                        if (link.dataset.title === linkTitle) {
                            link.style.backgroundColor = '#fff3cd';
                            link.style.fontWeight = 'bold';
                            link.style.border = '2px solid #ffc107';
                            link.scrollIntoView({ behavior: 'smooth', block: 'center' });

                            setTimeout(() => {
                                link.style.backgroundColor = '';
                                link.style.fontWeight = '';
                                link.style.border = '';
                            }, 8000);
                        }
                    });
                }, 2000);
            }
        }, 600); // Slightly longer wait to ensure article is fully rendered
    }

    async loadArticle(title) {
        try {
            const articleContent = document.getElementById('article-content');
            if (!articleContent) return;

            // Show loading
            articleContent.innerHTML =
                '<div class="text-center mt-5">' +
                '<div class="spinner-border text-primary" style="width: 3rem; height: 3rem;" role="status">' +
                '<span class="visually-hidden">Loading...</span>' +
                '</div>' +
                '<h4 class="mt-3">Loading "' + title + '"...</h4>' +
                '<p class="text-muted">Fetching from Wikipedia...</p>' +
                '</div>';

            const response = await fetch('/api/article/' + encodeURIComponent(title));
            const data = await response.json();

            if (data.error) {
                articleContent.innerHTML =
                    '<div class="alert alert-danger">' +
                    '<h4>Error</h4>' +
                    '<p>' + data.error + '</p>' +
                    '</div>';
                return;
            }

            // Process content
            let processedContent = this.processWikipediaContent(data.content);

            // Display article
            articleContent.innerHTML =
                '<div class="wikipedia-article">' +
                '<h1 class="article-title">' + data.title + '</h1>' +
                (data.summary ? '<div class="article-summary text-muted mb-3"><i>' +
                    data.summary.substring(0, 200) + '...</i></div>' : '') +
                '<hr>' +
                '<div class="article-body">' +
                processedContent +
                '</div>' +
                '</div>';

            // Make links clickable
            this.setupWikipediaLinks();

            // Count links
            const linkCount = document.querySelectorAll('.wiki-game-link').length;
            const articleCount = document.getElementById('article-count');
            if (articleCount) {
                articleCount.textContent = 'Links: ' + linkCount;
            }

            // Scroll to top
            const articleContentDiv = document.querySelector('.article-content');
            if (articleContentDiv) {
                articleContentDiv.scrollTop = 0;
            }

        } catch (error) {
            console.error('Failed to load article:', error);
            const articleContent = document.getElementById('article-content');
            if (articleContent) {
                articleContent.innerHTML =
                    '<div class="alert alert-danger">' +
                    '<h4>Failed to load article</h4>' +
                    '<p>Please check your connection and try again.</p>' +
                    '<button class="btn btn-primary mt-2" onclick="location.reload()">Reload</button>' +
                    '</div>';
            }
        }
    }

    processWikipediaContent(htmlContent) {
        // Create a DOM parser
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');

        // Remove unwanted elements
        this.removeUnwantedElements(doc);

        // Process links
        this.processWikiLinks(doc);

        // Add styling
        this.addWikipediaStyling(doc);

        // Get processed HTML
        let processedHtml = doc.body.innerHTML;

        // Truncate if too long
        const maxLength = 500000;
        if (processedHtml.length > maxLength) {
            processedHtml = processedHtml.substring(0, maxLength) +
                '<div class="alert alert-info mt-3">Article truncated for performance.</div>';
        }

        return processedHtml;
    }

    removeUnwantedElements(doc) {
        const selectorsToRemove = [
            '#toc',
            '.toc',
            '.navbox',
            '.vertical-navbox',
            '.metadata',
            '.mbox-small',
            '#siteNotice',
            '.mw-jump-link',
            '.printfooter',
            '.catlinks',
            '.mw-normal-catlinks',
            '#mw-normal-catlinks'
        ];

        for (let i = 0; i < selectorsToRemove.length; i++) {
            try {
                const elements = doc.querySelectorAll(selectorsToRemove[i]);
                for (let j = 0; j < elements.length; j++) {
                    elements[j].remove();
                }
            } catch (e) {
                // Ignore errors
            }
        }

        // Remove navigation tables
        try {
            const tables = doc.querySelectorAll('table');
            for (let i = 0; i < tables.length; i++) {
                const table = tables[i];
                if (table.className.includes('navbox') ||
                    table.className.includes('infobox') ||
                    table.className.includes('vertical-navbox')) {
                    table.remove();
                }
            }
        } catch (e) {
            // Ignore errors
        }
    }

    processWikiLinks(doc) {
        try {
            const links = doc.querySelectorAll('a[href^="/wiki/"]');

            for (let i = 0; i < links.length; i++) {
                const link = links[i];
                const href = link.getAttribute('href');
                // IMPROVED TITLE EXTRACTION
                // Decode the URL and clean it properly
                let title = decodeURIComponent(href.replace('/wiki/', ''));

                // Handle underscores and special characters
                title = title.replace(/_/g, ' ');

                // Remove any URL parameters (like ?title=...)
                if (title.includes('?')) {
                    title = title.split('?')[0];
                }

                // Skip special pages
                if (href.includes(':') ||
                    href.includes('#') ||
                    title.includes('File:') ||
                    title.includes('Special:') ||
                    title.includes('Help:') ||
                    title.includes('Category:')) {
                    link.setAttribute('target', '_blank');
                    link.setAttribute('rel', 'noopener');
                    continue;
                }

                // Convert to game link
                link.classList.add('wiki-game-link');
                link.setAttribute('data-title', title);
                link.setAttribute('href', '#');

                // Remove Wikipedia attributes
                link.removeAttribute('target');
                link.removeAttribute('rel');
            }
        } catch (e) {
            console.error('Error processing links:', e);
        }
    }

    addWikipediaStyling(doc) {
        try {
            doc.body.classList.add('wikipedia-body');

            const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
            for (let i = 0; i < headings.length; i++) {
                headings[i].classList.add('wikipedia-heading');
            }

            const paragraphs = doc.querySelectorAll('p');
            for (let i = 0; i < paragraphs.length; i++) {
                paragraphs[i].classList.add('wikipedia-paragraph');
            }

            const images = doc.querySelectorAll('img');
            for (let i = 0; i < images.length; i++) {
                images[i].classList.add('img-fluid', 'wikipedia-image');
                images[i].style.maxWidth = '100%';
                images[i].style.height = 'auto';
            }
        } catch (e) {
            // Ignore errors
        }
    }

    // FIXED: This method had the syntax error
    setupWikipediaLinks() {
        try {
            const links = document.querySelectorAll('.wiki-game-link');
            const self = this; // Store reference to this

            for (let i = 0; i < links.length; i++) {
                const link = links[i];

                // Click handler
                link.addEventListener('click', function (e) {
                    e.preventDefault();
                    const title = this.dataset.title;

                    if (!title) return;

                    // Visual feedback
                    this.style.backgroundColor = '#e7f1ff';
                    setTimeout(function () {
                        this.style.backgroundColor = '';
                    }.bind(this), 200);

                    self.makeMove(title); // Use self instead of this
                });

                // Mouse enter handler
                link.addEventListener('mouseenter', function () {
                    this.style.backgroundColor = '#e7f1ff';
                });

                // Mouse leave handler
                link.addEventListener('mouseleave', function () {
                    this.style.backgroundColor = '';
                });
            }

            // Handle external links
            const externalLinks = document.querySelectorAll('a[href^="https://en.wikipedia.org"]');
            for (let i = 0; i < externalLinks.length; i++) {
                externalLinks[i].setAttribute('target', '_blank');
                externalLinks[i].setAttribute('rel', 'noopener');
            }
        } catch (e) {
            console.error('Error setting up links:', e);
        }
    }

    makeMove(title) {
        this.moves++;
        this.score = Math.max(100, this.score - 10);

        this.currentArticle = title;
        const currentTitle = document.getElementById('current-title');
        if (currentTitle) {
            currentTitle.innerHTML = 'Current: <span class="text-muted">' + title + '</span>';
        }

        this.updateUI();
        this.loadArticle(title);

        // IMPROVED WIN CONDITION CHECKING
        const currentLower = title.toLowerCase();
        const goalLower = this.goalArticle.toLowerCase();

        // Check for exact match
        if (currentLower === goalLower) {
            console.log('WINNER! Exact match:', title);
            this.endGame(true);
            return;
        }

        // Check for singular/plural variations
        if (currentLower + 's' === goalLower || currentLower === goalLower + 's') {
            console.log('WINNER! Singular/plural match:', title, 'vs', this.goalArticle);
            this.endGame(true);
            return;
        }

        // Check if one contains the other (for phrases)
        if (goalLower.includes(currentLower) || currentLower.includes(goalLower)) {
            if (goalLower.length > 3 && currentLower.length > 3) {
                console.log('WINNER! Partial match:', title, 'vs', this.goalArticle);
                this.endGame(true);
                return;
            }
        }

        console.log('No win yet:', title, 'vs', this.goalArticle);
    }

    updateUI() {
        const scoreEl = document.getElementById('score');
        const movesEl = document.getElementById('moves');

        if (scoreEl) {
            scoreEl.textContent = this.score;
        }
        if (movesEl) {
            movesEl.textContent = this.moves;
        }
    }

    startTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.timerInterval = setInterval(function () {
            this.updateTimer();
        }.bind(this), 1000);
    }

    updateTimer() {
        if (!this.startTime) return;

        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;

        const timerEl = document.getElementById('timer');
        if (timerEl) {
            timerEl.textContent =
                (minutes < 10 ? '0' + minutes : minutes) + ':' +
                (seconds < 10 ? '0' + seconds : seconds);
        }
    }

    endGame(won) {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        const timeElapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const finalScore = this.calculateFinalScore(timeElapsed);

        if (won) {
            // Create a more visible win message
            const articleContent = document.getElementById('article-content');
            const winMessage = document.createElement('div');
            winMessage.className = 'win-message';
            winMessage.innerHTML = `
                <div class="alert alert-success text-center" style="position: sticky; top: 0; z-index: 100; margin-bottom: 1rem;">
                    <h3>🎉 YOU WIN! 🎉</h3>
                    <p>You reached the goal in ${this.moves} moves!</p>
                    <p>Time: ${timeElapsed}s | Final Score: ${finalScore}</p>
                    <button class="btn btn-primary" onclick="location.reload()">Play Again</button>
                </div>
        `   ;

            // Insert at the top of the article
            if (articleContent && articleContent.firstChild) {
                articleContent.insertBefore(winMessage, articleContent.firstChild);
            } else if (articleContent) {
                articleContent.appendChild(winMessage);
            }

            // Also show an alert as backup
            alert('🎉 YOU WIN! 🎉\n\nYou reached the goal in ' + this.moves + ' moves!\nTime: ' + timeElapsed + 's\nFinal Score: ' + finalScore);
        } else {
            alert('Game Over!\n\nFinal Score: ' + finalScore);
        }
    }


    calculateFinalScore(timeElapsed) {
        let score = this.score;
        score -= Math.floor(timeElapsed / 10);

        if (this.moves < 10) {
            score += (10 - this.moves) * 20;
        }

        return Math.max(0, Math.round(score));
    }

    setupEventListeners() {
        const newGameBtn = document.getElementById('new-game');
        const hintBtn = document.getElementById('hint');
        const giveUpBtn = document.getElementById('give-up');

        if (newGameBtn) {
            newGameBtn.addEventListener('click', function () {
                if (confirm('Start a new game? Current progress will be lost.')) {
                    this.startNewGame();
                }
            }.bind(this));
        }

        if (hintBtn) {
            hintBtn.addEventListener('click', async function () {
                if (this.score >= 50) {
                    this.score -= 50;
                    this.updateUI();

                    hintBtn.disabled = true;
                    hintBtn.textContent = 'Analyzing...';

                    try {
                        const response = await fetch(
                            `/api/best-link?current=${encodeURIComponent(this.currentArticle)}&goal=${encodeURIComponent(this.goalArticle)}`
                        );
                        const data = await response.json();

                        if (data.error) {
                            alert('Could not analyze links. Try again later.');
                        } else if (data.bestLink) {
                            let message = `🔍 Smart Hint:\n\nBased on our analysis, the best link to click is:\n\n👉 "${data.bestLink}"\n\n${data.message}`;

                            if (data.alternatives && data.alternatives.length > 0) {
                                message += `\n\nOther options: ${data.alternatives.join(', ')}`;
                            }

                            alert(message);
                            this.highlightSuggestedLink(data.bestLink);
                        } else {
                            // No relevant links found
                            alert('No clearly relevant links found in this article. Try exploring different paths!');
                        }
                    } catch (error) {
                        console.error('Hint error:', error);
                        alert('Error getting hint. Please try again.');
                    } finally {
                        hintBtn.disabled = false;
                        hintBtn.textContent = 'Hint (-50)';
                    }
                } else {
                    alert('Not enough points for a hint! (Need 50 points)');
                }
            }.bind(this));
        }

        // Fixed give up button
        if (giveUpBtn) {
            giveUpBtn.addEventListener('click', function () {
                if (confirm('Are you sure you want to give up?')) {
                    this.endGame(false);
                }
            }.bind(this));
        }
    }
}

// Create the game instance
var game = new WikiGame();