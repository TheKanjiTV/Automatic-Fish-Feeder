#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <time.h>

// =====================
// DEVICE ID
// =====================
#define DEVICE_ID "esp32_2"

// =====================
// WIFI
// =====================
#define WIFI_SSID "ZTE_2.4G_sghzjg"
#define WIFI_PASSWORD "RRxh5Srk"

// =====================
// FIREBASE
// =====================
#define API_KEY "AIzaSyDQ4JwGIS9U0and9MJFIDRsumiJlQEnKWs"
#define DATABASE_URL "https://automatic-fish-fisher-default-rtdb.asia-southeast1.firebasedatabase.app/"

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

const unsigned long STATUS_INTERVAL_MS = 5000;
unsigned long lastStatusUpdate = 0;
const long GMT_OFFSET_SEC = 8 * 3600;
const int DAYLIGHT_OFFSET_SEC = 0;

// =====================
// DS18B20
// =====================
#define ONE_WIRE_BUS 5

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

// =====================
// SENSOR PINS
// =====================
#define PH_PIN 35
#define TURBIDITY_PIN 34

// =====================
// PH CALIBRATION
// =====================
#define PH_NEUTRAL_VOLTAGE 2.50
#define PH_SLOPE 0.18

// =====================
// TURBIDITY CALIBRATION
// =====================

// clean water reading
#define TURBIDITY_CLEAR 4095

// dirty water reading
#define TURBIDITY_DIRTY 3330

// =====================
// PH FUNCTION
// =====================
float calculatePh(float voltage) {

  float ph =
    7 + ((PH_NEUTRAL_VOLTAGE - voltage) / PH_SLOPE);

  if (ph < 0 || ph > 14) {
    return 0;
  }

  return ph;
}

// =====================
// TURBIDITY FUNCTION
// =====================
float getTurbidityPercent(int rawValue) {

  float percent =
    ((float)(TURBIDITY_CLEAR - rawValue) /
    (TURBIDITY_CLEAR - TURBIDITY_DIRTY)) * 100.0;

  if (percent > 100) percent = 100;

  if (percent < 0) percent = 0;

  return percent;
}

// =====================
// TIME HELPERS
// =====================
String getTimestampString() {

  time_t now = time(nullptr);

  if (now < 100000) {
    return "";
  }

  struct tm timeinfo;
  localtime_r(&now, &timeinfo);

  char buffer[22];

  strftime(
    buffer,
    sizeof(buffer),
    "%Y-%m-%d %H:%M:%S",
    &timeinfo
  );

  return String(buffer);
}

// =====================
// SENSOR LOGGING
// =====================
void writeSensorLog(
  float temperature,
  float phValue,
  float turbidity
) {

  FirebaseJson log;

  log.set("deviceId", DEVICE_ID);
  log.set("temperature", temperature);
  log.set("ph", phValue);
  log.set("turbidity", turbidity);

  String timestamp = getTimestampString();

  if (timestamp.length()) {
    log.set("timestamp", timestamp);
  }
  else {
    log.set("timestamp", String(millis()));
  }

  Firebase.RTDB.pushJSON(
    &fbdo,
    "/history",
    &log
  );
}

// =====================
// SYSTEM STATUS
// =====================
void updateSystemStatus() {

  String wifiStatus =
    WiFi.status() == WL_CONNECTED
      ? "Connected"
      : "Disconnected";

  Firebase.RTDB.setString(
    &fbdo,
    "/system/esp32_2/status",
    "Online"
  );

  Firebase.RTDB.setString(
    &fbdo,
    "/system/esp32_2/wifiStatus",
    wifiStatus
  );

  if (WiFi.status() == WL_CONNECTED) {
    Firebase.RTDB.setInt(
      &fbdo,
      "/system/esp32_2/wifiRssi",
      WiFi.RSSI()
    );
  }

  Firebase.RTDB.setTimestamp(
    &fbdo,
    "/system/esp32_2/lastSeen"
  );
}

// =====================
// SETUP
// =====================
void setup() {

  Serial.begin(115200);

  Serial.println();
  Serial.println("=====================");
  Serial.println("ESP32 SENSOR SYSTEM");
  Serial.println("=====================");

  // DS18B20
  sensors.begin();

  // Improve ADC range
  analogSetPinAttenuation(PH_PIN, ADC_11db);
  analogSetPinAttenuation(TURBIDITY_PIN, ADC_11db);

  // WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }

  Serial.println();
  Serial.println("WiFi Connected");

  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // Firebase
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;

  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("Firebase SignUp OK");
  }
  else {
    Serial.println("Firebase SignUp Failed");
  }

  Firebase.begin(&config, &auth);

  Firebase.reconnectWiFi(true);

  Serial.println("Firebase Connected");

  configTime(
    GMT_OFFSET_SEC,
    DAYLIGHT_OFFSET_SEC,
    "pool.ntp.org",
    "time.nist.gov"
  );
}

// =====================
// LOOP
// =====================
void loop() {

  // =====================
  // TEMPERATURE
  // =====================
  sensors.requestTemperatures();

  float temperatureC =
    sensors.getTempCByIndex(0);

  if (
    temperatureC == -127 ||
    temperatureC == 85 ||
    temperatureC > 60 ||
    temperatureC < 0
  ) {
    temperatureC = 0;
  }

  Serial.print("TEMPERATURE: ");
  Serial.print(temperatureC);
  Serial.println(" C");

  Firebase.RTDB.setFloat(
    &fbdo,
    "/sensors/temperature",
    temperatureC
  );

  // =====================
  // PH SENSOR
  // =====================
  long phTotal = 0;

  for (int i = 0; i < 20; i++) {

    phTotal += analogRead(PH_PIN);

    delay(10);
  }

  int phRaw = phTotal / 20;

  float phVoltage =
    phRaw * (3.3 / 4095.0);

  float phValue =
    calculatePh(phVoltage);

  Serial.print("PH RAW: ");
  Serial.println(phRaw);

  Serial.print("PH VOLTAGE: ");
  Serial.println(phVoltage);

  Serial.print("PH VALUE: ");
  Serial.println(phValue);

  Firebase.RTDB.setFloat(
    &fbdo,
    "/sensors/ph",
    phValue
  );

  Firebase.RTDB.setInt(
    &fbdo,
    "/sensors/phRaw",
    phRaw
  );

  // =====================
  // TURBIDITY SENSOR
  // =====================
  long turbidityTotal = 0;

  for (int i = 0; i < 20; i++) {

    turbidityTotal += analogRead(TURBIDITY_PIN);

    delay(10);
  }

  int turbidityRaw =
    turbidityTotal / 20;

  float dirtiness =
    getTurbidityPercent(turbidityRaw);

  // =====================
  // WATER STATUS
  // =====================
  String waterStatus;

  if (dirtiness <= 20) {
    waterStatus = "Clear";
  }
  else if (dirtiness <= 60) {
    waterStatus = "Cloudy";
  }
  else {
    waterStatus = "Dirty";
  }

  Serial.print("TURBIDITY RAW: ");
  Serial.println(turbidityRaw);

  Serial.print("DIRTINESS: ");
  Serial.print(dirtiness);
  Serial.println("%");

  Serial.print("WATER STATUS: ");
  Serial.println(waterStatus);

  Firebase.RTDB.setFloat(
    &fbdo,
    "/sensors/turbidity",
    dirtiness
  );

  Firebase.RTDB.setInt(
    &fbdo,
    "/sensors/turbidityRaw",
    turbidityRaw
  );

  Firebase.RTDB.setString(
    &fbdo,
    "/system/waterStatus",
    waterStatus
  );

  writeSensorLog(
    temperatureC,
    phValue,
    dirtiness
  );

  if (millis() - lastStatusUpdate >= STATUS_INTERVAL_MS) {
    updateSystemStatus();
    lastStatusUpdate = millis();
  }

  Serial.println("=====================");

  delay(5000);
}
