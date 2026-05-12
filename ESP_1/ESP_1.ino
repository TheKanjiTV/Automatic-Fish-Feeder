#include <Wire.h>
#include <DS3231.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <ESP32Servo.h>

// =====================
// DEVICE ID
// =====================
#define DEVICE_ID "esp32_1"

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

// =====================
// RTC
// =====================
DS3231 rtc;

// =====================
// SERVO
// =====================
Servo servo;

#define SERVO_PIN 13

const unsigned long STATUS_INTERVAL_MS = 5000;
unsigned long lastStatusUpdate = 0;

bool alreadyFedTime0 = false;
bool alreadyFedTime1 = false;
bool alreadyFedTime2 = false;

// =====================
// FIREBASE HELPERS
// =====================
int readFirebaseInt(String path, int fallbackValue) {

  if (Firebase.RTDB.getInt(&fbdo, path)) {
    return fbdo.intData();
  }

  return fallbackValue;
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
    "/system/esp32_1/status",
    "Online"
  );

  Firebase.RTDB.setString(
    &fbdo,
    "/system/esp32_1/wifiStatus",
    wifiStatus
  );

  if (WiFi.status() == WL_CONNECTED) {
    Firebase.RTDB.setInt(
      &fbdo,
      "/system/esp32_1/wifiRssi",
      WiFi.RSSI()
    );
  }

  Firebase.RTDB.setTimestamp(
    &fbdo,
    "/system/esp32_1/lastSeen"
  );
}

// =====================
// FEEDER
// =====================
int getServoFeedAngle() {

  int angle =
    readFirebaseInt("/settings/servoAngle", 60);

  // limit 1-120 only
  angle = constrain(angle, 1, 120);

  return angle;
}

void moveServo(int angle) {

  angle = constrain(angle, 1, 120);

  Serial.print("Moving Servo To: ");
  Serial.print(angle);
  Serial.println(" degrees");

  servo.write(angle);

  delay(1000);

  servo.write(0);

  Serial.println("Servo Returned To 0");
}

void runFeeder(String feedType) {

  int servoAngle = getServoFeedAngle();

  Serial.print("Feeding Type: ");
  Serial.println(feedType);

  moveServo(servoAngle);

  writeFeedingLog(feedType);
}

// =====================
// FEEDING LOG
// =====================
void writeFeedingLog(String feedType) {

  FirebaseJson log;

  log.set("deviceId", DEVICE_ID);

  log.set("timestamp", getDateTimeString());

  log.set("type", feedType);

  log.set("servoAngle", getServoFeedAngle());

  Firebase.RTDB.pushJSON(
    &fbdo,
    "/logs",
    &log
  );
}

// =====================
// SETUP
// =====================
void setup() {

  Serial.begin(115200);

  Serial.println();
  Serial.println("======================");
  Serial.println("ESP32 FEEDER SYSTEM");
  Serial.println("======================");

  // RTC
  Wire.begin(21, 22);

  // Servo
  servo.setPeriodHertz(50);

  servo.attach(SERVO_PIN, 500, 2500);

  servo.write(0);

  Serial.println("Servo Initialized");

  // WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED) {

    Serial.print(".");

    delay(500);
  }

  Serial.println();
  Serial.println("WiFi Connected");

  // Firebase
  config.api_key = API_KEY;

  config.database_url = DATABASE_URL;

  Firebase.signUp(&config, &auth, "", "");

  Firebase.begin(&config, &auth);

  Firebase.reconnectWiFi(true);

  Serial.println("Firebase Connected");

  Serial.println("======================");
  Serial.println("SERIAL COMMANDS");
  Serial.println("======================");
  Serial.println("Type F = Feed");
  Serial.println("Type 1-120 = Servo Angle");
  Serial.println("======================");
}

// =====================
// LOOP
// =====================
void loop() {

  // =====================
  // SERIAL COMMANDS
  // =====================
  if (Serial.available()) {

    String input =
      Serial.readStringUntil('\n');

    input.trim();

    input.toUpperCase();

    // =====================
    // FEED COMMAND
    // =====================
    if (input == "F") {

      Serial.println("Manual Feed Command");

      runFeeder("manual_serial");
    }

    // =====================
    // ANGLE COMMAND
    // =====================
    else {

      int angle = input.toInt();

      if (angle >= 1 && angle <= 120) {

        moveServo(angle);
      }
      else {

        Serial.println("Invalid Angle");
        Serial.println("Allowed: 1-120");
      }
    }
  }

  // =====================
  // FIREBASE FEEDNOW
  // =====================
  if (Firebase.RTDB.getInt(&fbdo, "/feednow")) {

    if (fbdo.intData() == 1) {

      Serial.println("Firebase Feed Command");

      runFeeder("manual_feed");

      Firebase.RTDB.setInt(
        &fbdo,
        "/feednow",
        0
      );
    }
  }

  // =====================
  // RTC TIME
  // =====================
  if (millis() - lastStatusUpdate >= STATUS_INTERVAL_MS) {
    updateSystemStatus();
    lastStatusUpdate = millis();
  }
  bool h12;
  bool PM;

  int hour =
    rtc.getHour(h12, PM);

  int minute =
    rtc.getMinute();

  char currentTime[6];

  sprintf(
    currentTime,
    "%02d:%02d",
    hour,
    minute
  );

  Serial.print("Current Time: ");
  Serial.println(currentTime);

  // =====================
  // TIMER CHECK
  // =====================
  checkSimpleTimer(
    "/timers/time0",
    currentTime,
    0
  );

  checkSimpleTimer(
    "/timers/time1",
    currentTime,
    1
  );

  checkSimpleTimer(
    "/timers/time2",
    currentTime,
    2
  );

  delay(1000);
}

// =====================
// TIMER CHECK
// =====================
void checkSimpleTimer(
  String path,
  char currentTime[],
  int timerIndex
) {

  if (Firebase.RTDB.getString(&fbdo, path)) {

    String timer =
      fbdo.stringData();

    if (timer.length() >= 5) {

      timer =
        timer.substring(0, 5);

      if (timer == String(currentTime)) {

        if (
          timerIndex == 0 &&
          !alreadyFedTime0
        ) {

          Serial.println("Scheduled Feed 0");

          runFeeder("schedule_0");

          alreadyFedTime0 = true;
        }

        if (
          timerIndex == 1 &&
          !alreadyFedTime1
        ) {

          Serial.println("Scheduled Feed 1");

          runFeeder("schedule_1");

          alreadyFedTime1 = true;
        }

        if (
          timerIndex == 2 &&
          !alreadyFedTime2
        ) {

          Serial.println("Scheduled Feed 2");

          runFeeder("schedule_2");

          alreadyFedTime2 = true;
        }

      }
      else {

        if (timerIndex == 0)
          alreadyFedTime0 = false;

        if (timerIndex == 1)
          alreadyFedTime1 = false;

        if (timerIndex == 2)
          alreadyFedTime2 = false;
      }
    }
  }
}

// =====================
// TIME STRING
// =====================
String getDateTimeString() {

  bool h12 = false;
  bool PM = false;
  bool century = false;

  int year =
    rtc.getYear();

  int month =
    rtc.getMonth(century);

  int date =
    rtc.getDate();

  int hour =
    rtc.getHour(h12, PM);

  int minute =
    rtc.getMinute();

  int second =
    rtc.getSecond();

  char buffer[25];

  sprintf(
    buffer,
    "20%02d-%02d-%02d %02d:%02d:%02d",
    year,
    month,
    date,
    hour,
    minute,
    second
  );

  return String(buffer);
}
