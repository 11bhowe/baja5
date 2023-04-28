#include <ArduinoBLE.h>

BLEService uartService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
BLEStringCharacteristic cmdChar("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", BLEWrite, 20);

BLEService essService("181A");
BLEShortCharacteristic sensor1("2A56", BLERead | BLENotify );
BLEShortCharacteristic sensor2("2A57", BLERead | BLENotify );

int deviceID;
int analog1;
int digital1;
int analog2;
int digital2;

int LEDpin = 12;
int pins[][4] = { // A1 D1 A2 D2
                    {6, 3, 7, 4},  // Device 1
                    {0, 2, 1, 3}   // Device 2
                };


void setup() {
  Serial.begin(9600);

  if (!BLE.begin()) {
    Serial.println("Starting BLE failed!");
    while (1)
      ;
  }

  // Determine which Arduino address for correct pin configuration
  if (BLE.address() == "4e:4f:19:3b:d9:be") {
    deviceID = 0;    
  }
  if (BLE.address() == "fe:ef:08:21:bd:2d") {
    deviceID = 1;
  }
  
  pinMode(pins[deviceID][1], INPUT);
  pinMode(pins[deviceID][3], INPUT);
  pinMode(LEDpin, OUTPUT);

  BLE.setLocalName("ArduinoBLE Gas Sensor");
  BLE.setAdvertisedService(uartService);
  essService.addCharacteristic(sensor1);
  essService.addCharacteristic(sensor2);
  uartService.addCharacteristic(cmdChar);
  BLE.addService(essService);
  BLE.addService(uartService);
  BLE.advertise();
  Serial.println("Bluetooth device (" + BLE.address() + ") active, waiting for connections...");
}

void loop() {
  BLEDevice central = BLE.central();

  if (central) {
    Serial.print("Connected to central: ");
    Serial.println(central.address());

    while (central.connected()) {
      // Read sensor 1
      analog1 = analogRead(pins[deviceID][0]);
      digital1 = digitalRead(pins[deviceID][1]);

      String msg1 = "1" + String(digital1, DEC) + String(analog1, DEC);               // combine digital & analog into single message
      short short1 = (short) msg1.toInt();                                            // convert to short for transmission
      sensor1.writeValue(short1);                                                     // transmit
      Serial.println("ONE " + String(analog1, DEC) + " " + String(digital1, DEC));    // print to serial monitor
      

      // Read sensor 2
      analog2 = analogRead(pins[deviceID][2]);  
      digital2 = digitalRead(pins[deviceID][3]);

      String msg2 = "1" + String(digital2, DEC) + String(analog2, DEC);
      short short2 = (short) msg2.toInt();
      sensor2.writeValue(short2);
      Serial.println("TWO " + String(analog2, DEC) + " " + String(digital2, DEC));


      // listen for VENT command from Pi
      if (cmdChar.written()) {
        String command = cmdChar.value();        
        Serial.print("[PI COMMAND] ");
        Serial.println(command);
        if (command == "VENT ON") {
          digitalWrite(LEDpin,HIGH);
        } else {
          digitalWrite(LEDpin,LOW);
        }
      }
      
      delay(3000);
    }

    // Serial.print("Disconnected from central: ");
    // Serial.println(central.address());
  }
}

