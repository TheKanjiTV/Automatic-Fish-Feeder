const Popup = {
    lastShown: {},

    show(title, message, level = "warning") {
        const key = `${title}:${message}`;
        const now = Date.now();

        if (this.lastShown[key] && now - this.lastShown[key] < 15000) {
            return;
        }

        this.lastShown[key] = now;

        const stack = document.getElementById("popupStack");
        const popup = document.createElement("div");
        popup.className = `popup ${level}`;
        popup.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
        stack.appendChild(popup);

        setTimeout(() => {
            popup.remove();
        }, 6000);
    }
};
