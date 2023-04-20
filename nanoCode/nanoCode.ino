#include <ArduinoBLE.h>

/*   We'll use the ArduinoBLE library to simulate a basic UART connection 
 *   following this UART service specification by Nordic Semiconductors. 
 *   More: https://learn.adafruit.com/introducing-adafruit-ble-bluetooth-low-energy-friend/uart-service
 */
BLEService uartService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
BLEStringCharacteristic cmdChar("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", BLEWrite, 20);

/*  Create a Environmental Sensing Service (ESS) and a 
 *  characteristic for its temperature value.
 */
BLEService essService("181A");
BLEShortCharacteristic sensor1("2A56", BLERead | BLENotify );
BLEShortCharacteristic sensor2("2A57", BLERead | BLENotify );

int analog1;
int digital1;
int analog2;
int digital2;

void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT);
  pinMode(3, INPUT);

  if (!BLE.begin()) {
    Serial.println("Starting BLE failed!");
    while (1)
      ;
  }

  String deviceAddress = BLE.address();
  BLE.setLocalName("ArduinoBLE Gas Sensor");
  BLE.setAdvertisedService(uartService);
  essService.addCharacteristic(sensor1);
  essService.addCharacteristic(sensor2);
  uartService.addCharacteristic(cmdChar);
  BLE.addService(essService);
  BLE.addService(uartService);
  BLE.advertise();
  Serial.println("Bluetooth device (" + deviceAddress + ") active, waiting for connections...");
}

void loop() {
  BLEDevice central = BLE.central();

  if (central) {
    Serial.print("Connected to central: ");
    Serial.println(central.address());

    while (central.connected()) {
      // Read sensor 1
      analog1 = analogRead(0);
      digital1 = digitalRead(2);

      String msg1 = "1" + String(digital1, DEC) + String(analog1, DEC);               // combine digital & analog into single message
      short short1 = (short) msg1.toInt();                                            // convert to short for transmission
      sensor1.writeValue(short1);                                                     // transmit
      Serial.println("ONE " + String(analog1, DEC) + " " + String(digital1, DEC));    // print to serial monitor
      

      // Read sensor 2
      analog2 = analogRead(1);  
      digital2 = digitalRead(3);

      String msg2 = "1" + String(digital2, DEC) + String(analog2, DEC);
      short short2 = (short) msg2.toInt();
      sensor2.writeValue(short2);
      Serial.println("TWO " + String(analog2, DEC) + " " + String(digital2, DEC));


      // listen for VENT command from Pi
      if (cmdChar.written()) {
        Serial.print("[Recv] ");
        Serial.println(cmdChar.value());
      }
      
      delay(3000);
    }

  //   // Serial.print("Disconnected from central: ");
  //   // Serial.println(central.address());
  }
}

