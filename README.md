# Automatic Fish Feeder

Smart aquaculture monitoring and automated feeding system using ESP32, Firebase, and real-time water quality sensors.

## Web Application

[Automatic Fish Feeder Dashboard](https://automaticfishfeeder.projectsmiledentalclinic.com/?utm_source=chatgpt.com)

---

## Project Overview

Automatic Fish Feeder is an IoT-based aquaculture system designed to automate fish feeding and monitor pond water conditions in real time.

The system uses:

* ESP32 microcontrollers
* Firebase Realtime Database
* RTC scheduling
* Servo-based feeding
* Water quality sensors

The platform helps improve:

* feeding consistency
* pond monitoring
* water quality management
* remote access monitoring

---

## Features

### Automated Feeding

* Scheduled feeding using RTC DS3231
* Servo motor feeding mechanism
* Manual feeding via dashboard
* Serial monitor feeding controls

### Water Monitoring

* Water temperature monitoring using DS18B20
* Turbidity monitoring
* pH monitoring
* Real-time sensor updates

### Cloud Integration

* Firebase Realtime Database integration
* Real-time dashboard updates
* Remote monitoring system

### Hardware Separation

* Dedicated ESP32 for feeding system
* Dedicated ESP32 for sensor monitoring
* Independent servo power regulation using buck converter

---

## System Architecture

### ESP32 #1

Handles:

* Servo motor
* RTC module
* Feeding scheduler

### ESP32 #2

Handles:

* DS18B20 temperature sensor
* pH sensor
* Turbidity sensor

---

## Hardware Components

### Microcontrollers

* ESP32 Dev Module ×2

### Sensors

* DS18B20 Waterproof Temperature Sensor
* Turbidity Sensor
* PH-4502C pH Sensor Module
* DS3231 RTC Module

### Actuators

* Servo Motor

### Power Components

* Buck Converter ×2
* 1000uF Capacitor

---

## Pin Configuration

### ESP32 #1

| Component   | GPIO   |
| ----------- | ------ |
| Servo Motor | GPIO13 |
| RTC SDA     | GPIO21 |
| RTC SCL     | GPIO22 |

### ESP32 #2

| Component    | GPIO   |
| ------------ | ------ |
| DS18B20 DATA | GPIO5  |
| pH Sensor PO | GPIO35 |
| Turbidity AO | GPIO34 |

---

## Technologies Used

### Embedded Systems

* Arduino IDE
* ESP32
* C++

### Backend

* Firebase Realtime Database

### Frontend

* Web Dashboard

### Communication

* WiFi
* Firebase Cloud Sync

---

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/your-username/Automatic-Fish-Feeder.git
```

### 2. Open Arduino IDE

Install required libraries:

* Firebase ESP Client
* DallasTemperature
* OneWire
* ESP32Servo
* RTClib / DS3231

### 3. Configure WiFi

Update:

```cpp
#define WIFI_SSID "YOUR_WIFI"
#define WIFI_PASSWORD "YOUR_PASSWORD"
```

### 4. Configure Firebase

Update:

```cpp
#define API_KEY "YOUR_API_KEY"
#define DATABASE_URL "YOUR_DATABASE_URL"
```

### 5. Upload Code

Upload:

* feeder firmware to ESP32 #1
* sensor firmware to ESP32 #2

---

## Sensor Calibration

### Turbidity Sensor

Calibrated using:

* clear water reference
* dirty water reference

### pH Sensor

Calibrated using:

* pH 4.01 buffer solution
* pH 6.86 buffer solution
* pH 9.18 buffer solution

---

## Future Improvements

* Mobile application support
* AI-based feeding prediction
* Automatic water quality alerts
* Solar-powered optimization
* Historical analytics dashboard

---

## Researchers / Developers

### Group Leaders

* Kenji Yonaha
* Alessandra Rivano

### Members

* Brian Jalos
* Lady Jane Laurente
* Redden Russel Ortega

---

## License

This project is for educational and research purposes.
