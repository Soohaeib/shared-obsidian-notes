document.addEventListener("DOMContentLoaded", () => {
    // 1. Look for the Obsidian YAML frontmatter block in the HTML
    const frontmatter = document.querySelector('.frontmatter code');
    if (!frontmatter) return;

    // 2. Extract the text safely and check for the 'pass' tag
    const fmText = frontmatter.textContent;
    const passMatch = fmText.match(/pass:\s*(.+)/);
    if (!passMatch) return;

    const expectedToken = passMatch[1].trim();

    // 3. Create the Gatekeeper Full-Screen Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(32, 33, 36, 0.95); /* Matches Obsidian dark mode */
        backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        z-index: 999999; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        font-family: var(--font-interface, sans-serif);
        transition: opacity 0.5s ease, visibility 0.5s ease;
    `;

    // 4. Create the sleek UI elements
    const title = document.createElement('h2');
    title.innerText = "Oops! Seems like there is an issue. What could it be?";
    title.style.cssText = `
        margin: 0 0 24px 0; font-size: 1.25rem; font-weight: 500;
        color: #e8e8e8; text-align: center; padding: 0 20px;
        text-shadow: 0 2px 10px rgba(0,0,0,0.5);
    `;

    const inputWrapper = document.createElement('div');
    inputWrapper.style.cssText = "position: relative; width: 80%; max-width: 340px;";

    const input = document.createElement('input');
    input.type = "password"; // Conceals the typing (adds to the mystery)
    input.placeholder = "Enter Access Token...";
    input.style.cssText = `
        width: 100%; box-sizing: border-box;
        background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.2);
        padding: 16px 20px; border-radius: 12px; color: white; font-size: 1.05rem;
        text-align: center; outline: none; letter-spacing: 2px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3); transition: all 0.3s ease;
    `;

    // Add glowing focus effects based on your site's accent color
    input.addEventListener('focus', () => {
        input.style.borderColor = "var(--interactive-accent, #8b6ce3)";
        input.style.boxShadow = "0 0 0 3px hsla(var(--interactive-accent-hsl, 258, 88%, 66%), 0.3)";
    });

    input.addEventListener('blur', () => {
        input.style.borderColor = "rgba(255, 255, 255, 0.2)";
        input.style.boxShadow = "0 8px 32px rgba(0,0,0,0.3)";
    });

    // Disable background scrolling while locked
    document.body.style.overflow = 'hidden';

    // Assemble the UI
    inputWrapper.appendChild(input);
    overlay.appendChild(title);
    overlay.appendChild(inputWrapper);
    document.body.appendChild(overlay);

    // 5. Real-Time Validation Engine
    input.addEventListener('input', (e) => {
        if (e.target.value === expectedToken) {
            // Success Feedback: Turn green and lock input
            input.style.borderColor = "#4ade80"; 
            input.style.color = "#4ade80";
            input.style.textShadow = "0 0 12px rgba(74, 222, 128, 0.5)";
            input.style.boxShadow = "0 0 0 3px rgba(74, 222, 128, 0.3)";
            input.disabled = true; 
            
            // Wait slightly so they can admire the green success state, then unlock
            setTimeout(() => {
                overlay.style.opacity = '0';
                document.body.style.overflow = ''; // Restore scrolling
                
                // Remove from DOM after fade-out completes
                setTimeout(() => overlay.remove(), 500);
            }, 500); 
        }
    });
    
    // Auto-focus the text box slightly after it loads
    setTimeout(() => input.focus(), 150);
});
