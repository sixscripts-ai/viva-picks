require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    authMethod: 'LOGIN', // Force AUTH LOGIN instead of PLAIN
    debug: true, // show debug output
    logger: true // log information in console
});

async function verify() {
    try {
        await transporter.verify();
        console.log('Server is ready to take our messages');
    } catch (error) {
        console.error('Error:', error);
    }
}

verify();
