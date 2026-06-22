const settings = require('../settings');

function onlyDigits(s = '') { 
    return String(s).replace(/\D/g, ''); 
}

function getOwners() {
    const raw = settings.ownerNumber;
    const owners = Array.isArray(raw) ? raw : String(raw).split ? String(raw).split(',') : [raw];
    return owners.map(o => onlyDigits(o));
}

module.exports = async function(sock, chatId, message, q) {
    try {
        const sender = onlyDigits(message.key?.participant || message.key?.remoteJid || '');
        if (!getOwners().includes(sender) && !message.key?.fromMe) {
            return await sock.sendMessage(chatId, { text: '❌ Owner only' }, { quoted: message });
        }

        if (!q) return await sock.sendMessage(chatId, { text: '⚠️ .report 923xxxxxxxxxx' }, { quoted: message });

        const target = onlyDigits(q);
        if (target.length < 10) return await sock.sendMessage(chatId, { text: '❌ Invalid number' }, { quoted: message });

        const tJid = target + '@s.whatsapp.net';

        // Send initial status message
        await sock.sendMessage(chatId, { 
            text: `🚨 SHADOW MASS REPORTER\n👤 Target: +${target}\n📊 Total: 10,000 Reports\n🔄 Cycles: 100 (Block/Unblock)\n⏳ Starting...` 
        }, { quoted: message });

        // Send warning DM to target
        try {
            await sock.sendMessage(tJid, { 
                text: '🌑 *SHADOW MASS REPORTER STARTED*\n\nYour number has been targeted for mass reporting.\n10,000 reports with 100 block/unblock cycles incoming...\n\n_Shadow MD Bot_' 
            });
        } catch(e) {}

        // Report messages
        const msgs = [
            'This number is sending spam messages. Please take action.',
            'This account is involved in fraudulent activities. Reported for abuse.',
            'This user is harassing and sending threatening messages. Please investigate.',
            'This number is sharing inappropriate content. Urgent action needed.',
            'Mass spam detected from this number. Automated reporting in progress.',
            'This account is fake and impersonating someone. Please verify and ban.',
            'Cyberbullying and abuse reported from this number. Please take strict action.',
            'This user is sending unsolicited promotional messages repeatedly. Spam report.',
            'Fraud and financial scam activities detected from this number. Reported.',
            'This account is violating WhatsApp terms of service. Please review and suspend.'
        ];

        let sent = 0;
        let blockCount = 0;

        // 100 cycles of: 50 reports -> block -> 50 reports -> unblock (10,000 total)
        for (let cycle = 0; cycle < 100; cycle++) {
            // Send 50 reports
            for (let i = 0; i < 50; i++) {
                try { 
                    await sock.sendMessage(tJid, { 
                        text: `📢 REPORT #${sent + 1}\n\n${msgs[sent % msgs.length]}\n\n_Shadow MD Bot_` 
                    }); 
                    sent++;
                } catch(e) {}
            }

            // Block target
            try {
                await sock.updateBlockStatus(tJid, 'block');
                blockCount++;
            } catch(e) {}

            // Send 50 more reports (while blocked)
            for (let i = 0; i < 50; i++) {
                try { 
                    await sock.sendMessage(tJid, { 
                        text: `📢 REPORT #${sent + 1}\n\n${msgs[sent % msgs.length]}\n\n_Shadow MD Bot_` 
                    }); 
                    sent++;
                } catch(e) {}
            }

            // Unblock target
            try {
                await sock.updateBlockStatus(tJid, 'unblock');
            } catch(e) {}

            // Progress update every 10 cycles
            if ((cycle + 1) % 10 === 0) {
                try {
                    await sock.sendMessage(chatId, { 
                        text: `⏳ PROGRESS: ${cycle + 1}/100 cycles\n📨 Reports sent: ${sent}/10000\n🚫 Blocks: ${blockCount}` 
                    });
                } catch(e) {}
            }
        }

        // Final block
        try {
            await sock.updateBlockStatus(tJid, 'block');
            blockCount++;
        } catch(e) {}

        await sock.sendMessage(chatId, { 
            text: `✅ REPORTING DONE\n👤 Target: +${target}\n📨 Reports: ${sent}/10000\n🚫 Block Cycles: ${blockCount}\n⚡ Status: Target mass reported successfully!` 
        }, { quoted: message });

    } catch(err) { 
        await sock.sendMessage(chatId, { text: '❌ Error: ' + err.message }, { quoted: message }); 
    }
};
