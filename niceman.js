const express = require('express');
const cors = require('cors');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const app = express();
app.use(cors());
app.use(express.json());

// Temporary memory store for latest OTP
let latestOtpData = {
    code: "------",
    service: "Waiting for email...",
    time: "--:--"
};

// IMAP Connection Setup for Gmail
const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
        user: process.env.GMAIL_USER, // Render environment variable se uthayega
        pass: process.env.GMAIL_PASS
    },
    logger: false
});

// Regex to extract OTP
function extractOTP(text) {
    const match = text.match(/(?:OTP|code|verification|pin)\s*(?:is)?:?\s*([0-9]{4,8})/i);
    if (match && match[1]) return match[1];
    const fallback = text.match(/\b\d{6}\b/);
    return fallback ? fallback[0] : null;
}

async function startEmailWatcher() {
    try {
        await client.connect();
        console.log('Connected to Gmail Inbox successfully!');

        await client.mailboxOpen('INBOX');

        // Listen for new incoming emails
        client.on('exists', async () => {
            const lock = await client.getMailboxLock('INBOX');
            try {
                for await (let message of client.fetch('1:*', { source: true, flags: false })) {
                    const parsed = await simpleParser(message.source);
                    const body = parsed.text || parsed.html || '';
                    const otp = extractOTP(body);

                    if (otp) {
                        latestOtpData = {
                            code: otp,
                            service: parsed.subject || 'Unknown Service',
                            time: new Date().toLocaleTimeString()
                        };
                        console.log('New OTP Captured:', otp);
                    }
                }
            } finally {
                lock.release();
            }
        });
    } catch (err) {
        console.error('IMAP Error:', err);
    }
}

// API endpoint jise website call karegi
app.get('/api/latest-otp', (req, res) => {
    res.json(latestOtpData);
});

// Ping route for keep-alive cron job
app.get('/', (req, res) => {
    res.send('OTP Backend is Alive!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startEmailWatcher();
});

const path = require('path');

// Frontend static files serve karne ke liye
app.use(express.static(path.join(__dirname)));