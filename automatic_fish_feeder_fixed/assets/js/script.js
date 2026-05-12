const firebaseConfig = {
    apiKey: "AIzaSyDQ4JwGIS9U0and9MJFIDRsumiJlQEnKWs",
    databaseURL: "https://automatic-fish-fisher-default-rtdb.asia-southeast1.firebasedatabase.app"
};

firebase.initializeApp(firebaseConfig);

const db = firebase.database();
const state = {
    selectedDevice: "main",
    sensors: {
        temperature: null,
        ph: null,
        turbidity: null,
        turbidityRaw: null
    },
    timers: {},
    logs: [],
    sensorLogs: [],
    activeListeners: []
};

const el = (id) => document.getElementById(id);

const charts = {
    temperature: createLineChart("temperatureChart", "Temperature", "#e8590c", " °C"),
    ph: createLineChart("phChart", "pH", "#087f5b", ""),
    turbidity: createLineChart("turbidityChart", "Turbidity", "#1c7ed6", " NTU")
};

document.addEventListener("DOMContentLoaded", () => {
    updateClock();
    setInterval(updateClock, 1000);
    addDeviceSelector();
    bindControls();
    bindDeviceList();
    bindFirebaseListeners();
    setInterval(refreshFirebaseOnce, 5000);
});

function pathFor(basePath) {
    if (state.selectedDevice === "main") {
        return basePath;
    }

    return `devices/${state.selectedDevice}/${basePath}`;
}

function addTrackedListener(ref, event, callback) {
    ref.on(event, callback);
    state.activeListeners.push({ ref, event, callback });
}

function clearTrackedListeners() {
    state.activeListeners.forEach(({ ref, event, callback }) => ref.off(event, callback));
    state.activeListeners = [];
}

function addDeviceSelector() {
    const meta = document.querySelector(".topbar__meta");
    if (!meta || el("deviceSelector")) return;

    const select = document.createElement("select");
    select.id = "deviceSelector";
    select.className = "device-selector";
    select.innerHTML = `<option value="main">Latest ESP32 Data</option>`;
    select.addEventListener("change", () => {
        state.selectedDevice = select.value;
        bindFirebaseListeners();
    });

    meta.insertBefore(select, el("darkModeToggle"));
}

function bindDeviceList() {
    db.ref("devices").on("value", (snapshot) => {
        const selector = el("deviceSelector");
        if (!selector) return;

        const currentValue = selector.value || "main";
        const devices = snapshot.val() || {};
        const options = [`<option value="main">Latest ESP32 Data</option>`];

        Object.keys(devices).sort().forEach((deviceId) => {
            options.push(`<option value="${escapeHtml(deviceId)}">${escapeHtml(deviceId)}</option>`);
        });

        selector.innerHTML = options.join("");
        selector.value = devices[currentValue] ? currentValue : "main";
        state.selectedDevice = selector.value;
    });
}

function bindControls() {
    el("feedNowButton").addEventListener("click", feedNow);
    el("saveFishCount").addEventListener("click", saveFishCount);
    el("saveSchedule").addEventListener("click", saveSchedule);
    el("saveFeedingAmount").addEventListener("click", saveFeedingAmount);
    el("downloadLogs").addEventListener("click", downloadLogsCsv);
    el("darkModeToggle").addEventListener("click", () => {
        document.body.classList.toggle("dark");
        el("darkModeToggle").textContent = document.body.classList.contains("dark") ? "Light Mode" : "Dark Mode";
    });

    el("fishCount").addEventListener("input", () => {
        const count = Number(el("fishCount").value || 0);
        el("servoLogic").textContent = `${count || 0} fish = ${calculateServoAngle(count)}° estimated servo rotation`;
    });
}

function bindFirebaseListeners() {
    clearTrackedListeners();

    addTrackedListener(db.ref(pathFor("sensors")), "value", (snapshot) => {
        const data = snapshot.val() || {};
        state.sensors = {
            temperature: toNumberOrNull(data.temperature),
            ph: toNumberOrNull(data.ph),
            turbidity: toNumberOrNull(data.turbidity),
            turbidityRaw: toNumberOrNull(data.turbidityRaw)
        };
        renderSensors();
        checkAlerts();
    });

    addTrackedListener(db.ref(pathFor("history")).limitToLast(30), "value", (snapshot) => {
        const rows = normalizeHistory(snapshot.val());
        state.sensorLogs = rows;
        updateChart("temperature", rows);
        updateChart("ph", rows);
        updateChart("turbidity", rows);
        renderSensorLogs();
    });

    addTrackedListener(db.ref("timers"), "value", (snapshot) => {
        state.timers = snapshot.val() || {};
        renderTimers();
    });

    addTrackedListener(db.ref("count"), "value", (snapshot) => {
        const count = Number(snapshot.val() || 0);
        if (count) {
            el("fishCount").value = count;
        }
        el("servoLogic").textContent = `${count || 0} fish = ${calculateServoAngle(count)}° estimated servo rotation`;
    });

    addTrackedListener(db.ref("settings/feedingAmount"), "value", (snapshot) => {
        const amount = Number(snapshot.val() || 0);
        if (amount) {
            el("feedingAmount").value = amount;
        }
    });

    addTrackedListener(db.ref(pathFor("system")), "value", (snapshot) => {
        renderSystemStatus(snapshot.val() || {});
    });

    addTrackedListener(db.ref(pathFor("logs")).limitToLast(25), "value", (snapshot) => {
        state.logs = normalizeLogs(snapshot.val());
        renderLogs();
    });
}

function refreshFirebaseOnce() {
    db.ref(pathFor("sensors")).once("value");
    db.ref(pathFor("system")).once("value");
}

function updateClock() {
    const now = new Date();
    el("currentDate").textContent = now.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "2-digit"
    });
    el("currentTime").textContent = now.toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function feedNow() {
    db.ref("feednow").set(1);
    Popup.show("Manual Feed Started", "Servo trigger sent to Firebase: /feednow = 1", "warning");
}

function saveFishCount() {
    const count = Math.max(1, Number(el("fishCount").value || 0));
    db.ref("count").set(count);
    Popup.show("Fish Count Saved", `${count} fish stored in Firebase.`, "safe");
}

function saveSchedule() {
    const updates = {
        "timers/time0": el("time0").value || "08:00",
        "timers/time1": el("time1").value || "12:00",
        "timers/time2": el("time2").value || "17:00"
    };
    db.ref().update(updates);
    Popup.show("Schedule Saved", "Feeding timers updated for RTC-based feeding.", "safe");
}

function saveFeedingAmount() {
    const amount = Math.max(1, Number(el("feedingAmount").value || 0));
    db.ref("settings/feedingAmount").set(amount);
    Popup.show("Feeding Amount Saved", `${amount} stored at settings/feedingAmount.`, "safe");
}

function renderSensors() {
    const temperature = state.sensors.temperature;
    const ph = state.sensors.ph;
    const turbidity = state.sensors.turbidity;

    const temperatureStatus = getTemperatureStatus(temperature);
    const phStatus = getPhStatus(ph);
    const turbidityStatus = getTurbidityStatus(turbidity);

    setSensorCard("temperatureCard", "temperatureStatus", temperatureStatus);
    setSensorCard("phCard", "phStatus", phStatus);
    setSensorCard("turbidityCard", "turbidityStatus", turbidityStatus);

    el("temperatureValue").textContent = Number.isFinite(temperature) ? `${temperature.toFixed(1)} °C` : "-- °C";
    el("phValue").textContent = Number.isFinite(ph) ? ph.toFixed(2) : "--";
    el("turbidityValue").textContent = Number.isFinite(turbidity) ? `${turbidity.toFixed(0)} NTU` : "-- NTU";

    el("summaryTemperature").textContent = el("temperatureValue").textContent;
    el("summaryPh").textContent = el("phValue").textContent;
    el("summaryTurbidity").textContent = el("turbidityValue").textContent;
    el("summaryTemperatureStatus").textContent = temperatureStatus.label;
    el("summaryTurbidityStatus").textContent = turbidityStatus.label;
}

function setSensorCard(cardId, statusId, status) {
    const card = el(cardId);
    card.classList.remove("safe", "warning", "critical");
    card.classList.add(status.level);
    el(statusId).textContent = status.label;
}

function getTemperatureStatus(value) {
    if (!Number.isFinite(value)) return { level: "warning", label: "Waiting" };
    if (value > 32 || value < 22) return { level: "critical", label: "Critical" };
    if (value > 30 || value < 24) return { level: "warning", label: "Warning" };
    return { level: "safe", label: "Safe" };
}

function getPhStatus(value) {
    if (!Number.isFinite(value)) return { level: "warning", label: "Waiting" };
    if (value < 6 || value > 9) return { level: "critical", label: "Critical" };
    if (value < 6.5 || value > 8.5) return { level: "warning", label: "Warning" };
    return { level: "safe", label: "Safe" };
}

function getTurbidityStatus(value) {
    if (!Number.isFinite(value)) return { level: "warning", label: "Waiting" };
    if (value >= 300) return { level: "critical", label: "Dirty Water" };
    if (value >= 180) return { level: "warning", label: "Cloudy" };
    return { level: "safe", label: "Clear" };
}

function renderTimers() {
    ["time0", "time1", "time2"].forEach((key) => {
        if (state.timers[key]) {
            el(key).value = normalizeTime(state.timers[key]);
        }
    });

    const next = getNextFeedingTime(Object.values(state.timers).map(normalizeTime).filter(Boolean));
    el("nextFeeding").textContent = next || "--:--";
}

function renderSystemStatus(system) {
    const devices = [
        { id: "esp32_1", label: "ESP32-1" },
        { id: "esp32_2", label: "ESP32-2" }
    ];
    const now = Date.now();
    const staleMs = 15000;
    const statusParts = [];
    const wifiParts = [];

    devices.forEach(({ id, label }) => {
        const raw = system[id];
        const data = typeof raw === "object" && raw !== null ? raw : {};
        const lastSeen = Number(data.lastSeen || 0);
        const online = lastSeen > 0 && now - lastSeen <= staleMs;
        const legacyStatus = typeof raw === "string" ? raw : "";
        const statusLabel = online ? "Online" : lastSeen ? "Offline" : legacyStatus || "Unknown";
        statusParts.push(`${label}: ${statusLabel}`);

        const rssi = Number(data.wifiRssi);
        const wifiStatus = data.wifiStatus || (Number.isFinite(rssi) ? "Connected" : "");
        let wifiText = "Unknown";
        if (online) {
            if (Number.isFinite(rssi)) {
                wifiText = `${wifiStatus} (${rssi} dBm)`;
            } else {
                wifiText = wifiStatus || "Connected";
            }
        } else if (lastSeen) {
            wifiText = "Disconnected";
        }

        wifiParts.push(`${label}: ${wifiText}`);
    });

    el("wifiStatus").textContent = system.wifi || wifiParts.join(" | ");
    el("espStatus").textContent = system.esp32 || system.deviceId || statusParts.join(" | ");
    el("batteryVoltage").textContent = Number.isFinite(Number(system.batteryVoltage)) && Number(system.batteryVoltage) > 0 ? `${Number(system.batteryVoltage).toFixed(1)} V` : "-- V";
    el("solarStatus").textContent = system.solar || "Unknown";
}

function renderLogs() {
    const table = el("logsTable");

    if (!state.logs.length) {
        table.innerHTML = `<tr><td colspan="3">No feeding logs yet.</td></tr>`;
        return;
    }

    table.innerHTML = state.logs.map((log) => `
        <tr>
            <td>${escapeHtml(log.date)}</td>
            <td>${escapeHtml(log.time)}</td>
            <td>${escapeHtml(capitalize(log.type))}</td>
        </tr>
    `).join("");
}

function renderSensorLogs() {
    const table = el("sensorLogsTable");
    if (!table) return;

    if (!state.sensorLogs.length) {
        table.innerHTML = `<tr><td colspan="5">No sensor logs yet.</td></tr>`;
        return;
    }

    const rows = state.sensorLogs
        .slice()
        .sort((a, b) => compareTimestamps(b.timestamp, a.timestamp))
        .slice(0, 25);

    table.innerHTML = rows.map((log) => {
        const { date, time } = splitTimestamp(log.timestamp);
        return `
        <tr>
            <td>${escapeHtml(date)}</td>
            <td>${escapeHtml(time)}</td>
            <td>${escapeHtml(formatNumber(log.temperature, 1, "--"))} °C</td>
            <td>${escapeHtml(formatNumber(log.ph, 2, "--"))}</td>
            <td>${escapeHtml(formatNumber(log.turbidity, 0, "--"))} NTU</td>
        </tr>
    `;
    }).join("");
}

function normalizeLogs(logs) {
    if (!logs) return [];

    return Object.values(logs).map((entry) => {
        const raw = entry.timestamp || entry.time || "";
        const parts = String(raw).split(" ");
        return {
            date: parts[0] || "--",
            time: parts[1] || "--",
            type: entry.type || "manual"
        };
    }).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}

function normalizeHistory(history) {
    if (!history) return [];

    if (Array.isArray(history)) {
        return history.filter(Boolean);
    }

    if ("timestamp" in history || "temperature" in history || "ph" in history || "turbidity" in history) {
        return [{
            timestamp: history.timestamp || history.time || "",
            temperature: Number(history.temperature),
            ph: Number(history.ph),
            turbidity: Number(history.turbidity)
        }];
    }

    return Object.values(history).map((entry) => ({
        timestamp: entry.timestamp || entry.time || "",
        temperature: Number(entry.temperature),
        ph: Number(entry.ph),
        turbidity: Number(entry.turbidity)
    })).filter((entry) => entry.timestamp);
}

function createLineChart(canvasId, label, color, unit) {
    const ctx = el(canvasId);
    return new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                label,
                data: [],
                borderColor: color,
                backgroundColor: `${color}26`,
                borderWidth: 3,
                fill: true,
                tension: 0.35,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${context.raw}${unit}`
                    }
                }
            },
            scales: {
                y: { beginAtZero: false }
            }
        }
    });
}

function updateChart(type, rows) {
    const chart = charts[type];
    const validRows = rows.filter((row) => Number.isFinite(Number(row[type])));
    chart.data.labels = validRows.map((row) => formatHistoryTime(row.timestamp));
    chart.data.datasets[0].data = validRows.map((row) => Number(row[type]));
    chart.update();
}

function normalizeTime(value) {
    if (!value) return "";
    const match = String(value).match(/(\d{2}:\d{2})/);
    return match ? match[1] : "";
}

function formatHistoryTime(value) {
    const time = normalizeTime(value);
    return time || String(value).slice(-8);
}

function splitTimestamp(value) {
    if (!value) return { date: "--", time: "--" };
    const raw = String(value).replace("T", " ");
    const parts = raw.split(" ");
    const date = parts[0] || "--";
    const time = (parts[1] || "--").slice(0, 8);
    return { date, time };
}

function compareTimestamps(a, b) {
    const aTime = Date.parse(String(a).replace(" ", "T"));
    const bTime = Date.parse(String(b).replace(" ", "T"));

    if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
        return aTime - bTime;
    }

    return String(a).localeCompare(String(b));
}

function getNextFeedingTime(times) {
    if (!times.length) return "";
    const now = new Date();
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const sorted = times.sort();
    return sorted.find((time) => {
        const [hours, minutes] = time.split(":").map(Number);
        return hours * 60 + minutes >= minutesNow;
    }) || sorted[0];
}

function calculateServoAngle(count) {
    if (!count) return 0;
    if (count <= 50) return 30;
    if (count <= 100) return 60;
    return 90;
}

function checkAlerts() {
    const temperature = state.sensors.temperature;
    const turbidity = state.sensors.turbidity;

    if (Number.isFinite(temperature) && temperature > 32) {
        Popup.show("High Temperature Alert", "High temperature detected.", "critical");
    }

    if (Number.isFinite(turbidity) && turbidity >= 300) {
        Popup.show("Low Water Quality Alert", "Water is dirty. Turbidity is above safe level.", "critical");
    }
}

function downloadLogsCsv() {
    const rows = [["Date", "Time", "Type"], ...state.logs.map((log) => [log.date, log.time, log.type])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "feeding-logs.csv";
    link.click();
    URL.revokeObjectURL(url);
}

function toNumberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function formatNumber(value, digits, fallback) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : fallback;
}

function capitalize(value) {
    return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
