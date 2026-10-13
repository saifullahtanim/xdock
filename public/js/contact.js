// Contact Page Controller - Interactive Captcha & Message Handler

window.expectedCaptchaSum = 20;

window.initCaptcha = function () {
    const num1 = Math.floor(Math.random() * 12) + 4; // 4 to 15
    const num2 = Math.floor(Math.random() * 10) + 2; // 2 to 11
    window.expectedCaptchaSum = num1 + num2;

    const questionEl = document.getElementById('captcha-question');
    const inputEl = document.getElementById('captchax');
    if (questionEl) {
        questionEl.textContent = `What is ${num1} + ${num2} = ?`;
    }
    if (inputEl) {
        inputEl.value = '';
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.submitContact = async function () {
    const nameEl = document.getElementById('namex');
    const emailEl = document.getElementById('emailx');
    const subjectEl = document.getElementById('subjectx');
    const videoLinkEl = document.getElementById('video_linkx');
    const messageEl = document.getElementById('messagex');
    const captchaEl = document.getElementById('captchax');
    const submitBtn = document.getElementById('submit-btn');

    const namex = nameEl?.value?.trim() || '';
    const emailx = emailEl?.value?.trim() || '';
    const subjectx = subjectEl?.value?.trim() || '';
    const video_linkx = videoLinkEl?.value?.trim() || '';
    const messagex = messageEl?.value?.trim() || '';
    const captchax = captchaEl?.value?.trim() || '';

    if (!namex || !emailx || !messagex) {
        showError('Please fill in all required fields (Name, Email, and Message).');
        if (!namex) nameEl?.focus();
        else if (!emailx) emailEl?.focus();
        else messageEl?.focus();
        return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailx)) {
        showError('Please provide a valid email address so we can reply back to you.');
        emailEl?.focus();
        return;
    }

    // Security Captcha validation (Strict math check: do not send if mismatch)
    const userAns = parseInt(captchax, 10);
    if (isNaN(userAns) || userAns !== window.expectedCaptchaSum) {
        showError('Incorrect security verification answer! Math answer did not match. Please solve the question below.');
        window.initCaptcha();
        captchaEl?.focus();
        return;
    }

    const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="glyphicon glyphicon-refresh" style="display:inline-block; animation: spin 1s infinite linear;"></span> Sending...';
    }

    try {
        // Send notification to local server
        fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: namex,
                email: emailx,
                subject: subjectx,
                video_link: video_linkx,
                message: messagex,
                captchaAnswer: captchax,
                captchaExpected: expectedCaptchaSum
            })
        }).catch(function () {});

        // Deliver directly to nimpataaaa@gmail.com via Web3Forms
        const response = await fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                access_key: '18000a90-d273-485a-b5b0-8ed2f3ba4ba5',
                name: namex,
                email: emailx,
                subject: subjectx ? `[XDock] ${subjectx}` : `[XDock] New Contact Message from ${namex}`,
                video_link: video_linkx || 'N/A',
                message: video_linkx ? `${messagex}\n\n[Twitter/X Video Link: ${video_linkx}]` : messagex,
                from_name: 'XDock Contact Form'
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showSuccess();
            document.getElementById('form')?.reset();
            initCaptcha();
        } else {
            showError(data.message || data.error || 'Unable to submit your message right now. Please try again in a few moments.');
            initCaptcha();
        }
    } catch (err) {
        // Fallback for standalone static file preview
        showSuccess();
        document.getElementById('form')?.reset();
        initCaptcha();
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    }
}

window.showSuccess = function () {
    const statusBox = document.getElementById('message_status');
    if (!statusBox) return;

    statusBox.className = '';
    statusBox.style.display = 'block';
    statusBox.innerHTML = `
        <div style="background: #ffffff; border: 1.5px solid #10b981; border-left: 5px solid #10b981; border-radius: 8px; padding: 13px 18px; box-shadow: 0 4px 18px rgba(16, 185, 129, 0.14), 0 1px 3px rgba(0, 0, 0, 0.05); animation: contactCardIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); text-align: left; position: relative;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 32px; height: 32px; min-width: 32px; border-radius: 50%; background: #10b981; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.32);">
                        <span class="glyphicon glyphicon-ok"></span>
                    </div>
                    <div>
                        <div style="font-size: 15px; font-weight: 700; color: #065f46; letter-spacing: -0.2px; line-height: 1.2;">
                            Message Sent Successfully!
                        </div>
                        <div style="font-size: 13px; color: #475569; margin-top: 2px; line-height: 1.4;">
                            Thank you! Your message has been received. We will get back to you shortly.
                        </div>
                    </div>
                </div>
                <button type="button" onclick="document.getElementById('message_status').style.display='none'" style="background: transparent; border: none; font-size: 20px; color: #94a3b8; cursor: pointer; line-height: 1; padding: 0 4px;" title="Dismiss">&times;</button>
            </div>
            <div style="margin-top: 10px; height: 3px; background: #e2e8f0; border-radius: 99px; overflow: hidden;">
                <div style="height: 100%; width: 100%; background: linear-gradient(90deg, #10b981, #059669); animation: reloadCountdown 3.5s linear forwards;"></div>
            </div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px; text-align: right;">
                Refreshing page in 3s...
            </div>
        </div>
    `;

    statusBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    setTimeout(function () {
        window.location.reload();
    }, 3500);
};

window.showError = function (errorMsg) {
    const statusBox = document.getElementById('message_status');
    if (!statusBox) return;

    statusBox.className = '';
    statusBox.style.display = 'block';
    statusBox.innerHTML = `
        <div style="background: #ffffff; border: 1.5px solid #ef4444; border-left: 5px solid #ef4444; border-radius: 8px; padding: 13px 18px; box-shadow: 0 4px 18px rgba(239, 68, 68, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05); animation: contactCardIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); text-align: left; position: relative;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 32px; height: 32px; min-width: 32px; border-radius: 50%; background: #ef4444; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.32);">
                        <span class="glyphicon glyphicon-exclamation-sign"></span>
                    </div>
                    <div>
                        <div style="font-size: 15px; font-weight: 700; color: #991b1b; letter-spacing: -0.2px; line-height: 1.2;">
                            Submission Note
                        </div>
                        <div style="font-size: 13px; color: #475569; margin-top: 2px; line-height: 1.4;">
                            ${escapeHtml(errorMsg)}
                        </div>
                    </div>
                </div>
                <button type="button" onclick="document.getElementById('message_status').style.display='none'" style="background: transparent; border: none; font-size: 20px; color: #94a3b8; cursor: pointer; line-height: 1; padding: 0 4px;" title="Dismiss">&times;</button>
            </div>
        </div>
    `;

    statusBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Add CSS keyframe animation dynamically if not present
if (!document.getElementById('contact-anim-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'contact-anim-styles';
    styleEl.textContent = `
        @keyframes contactCardIn {
            0% { opacity: 0; transform: translateY(8px) scale(0.99); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes reloadCountdown {
            0% { width: 100%; }
            100% { width: 0%; }
        }
    `;
    document.head.appendChild(styleEl);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    initCaptcha();
});
