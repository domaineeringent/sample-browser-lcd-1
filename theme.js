// Theme toggle functionality
document.addEventListener('DOMContentLoaded', () => {
    const html = document.documentElement;
    const themeToggle = document.querySelector('.theme-toggle');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsClose = document.querySelector('.settings-close');
    const themeSelect = document.getElementById('themeSelect');
    const skinSelect = document.getElementById('skinSelect');
    const appContainer = document.querySelector('.app-container');

    // Load saved preferences
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const savedSkin = localStorage.getItem('skin') || 'retro';

    // Apply saved preferences
    html.dataset.theme = savedTheme;
    appContainer.dataset.skin = savedSkin;
    themeSelect.value = savedTheme;
    skinSelect.value = savedSkin;
    themeToggle.textContent = `Mode: ${savedTheme.charAt(0).toUpperCase() + savedTheme.slice(1)}`;

    // Theme toggle button
    themeToggle.addEventListener('click', () => {
        const newTheme = html.dataset.theme === 'dark' ? 'light' : 'dark';
        html.dataset.theme = newTheme;
        localStorage.setItem('theme', newTheme);
        themeToggle.textContent = `Mode: ${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)}`;
    });

    // Settings panel
    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.add('visible');
    });

    settingsClose.addEventListener('click', () => {
        settingsPanel.classList.remove('visible');
    });

    // Theme select
    themeSelect.addEventListener('change', (e) => {
        const newTheme = e.target.value;
        html.dataset.theme = newTheme;
        localStorage.setItem('theme', newTheme);
        themeToggle.textContent = `Mode: ${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)}`;
    });

    // Skin select
    skinSelect.addEventListener('change', (e) => {
        const newSkin = e.target.value;
        appContainer.dataset.skin = newSkin;
        localStorage.setItem('skin', newSkin);
    });

    // Close settings panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsPanel.classList.remove('visible');
        }
    });
}); 