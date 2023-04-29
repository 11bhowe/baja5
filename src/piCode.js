const { createBluetooth } = require( 'node-ble' );

const ARDUINO_BLUETOOTH_ADDR1 = '4E:4F:19:3B:D9:BE';    // Brianna & JT Arduino
const ARDUINO_BLUETOOTH_ADDR2 = 'FE:EF:08:21:BD:2D';    // Austen & Alec Arduino

const UART_SERVICE_UUID       = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const CMD_CHARACTERISTIC_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';

const EES_SERVICE_UUID        = '0000181a-0000-1000-8000-00805f9b34fb';
const S1_CHARACTERISTIC_UUID  = '00002a56-0000-1000-8000-00805f9b34fb';
const S2_CHARACTERISTIC_UUID  = '00002a57-0000-1000-8000-00805f9b34fb';

// Global Variables
const numDevices = 1;
const deviceNames = ['Kitchen', 'Garage'];
const numSensors1 = 2;
const numSensors2 = 1;
const sensorNames = [['CO', 'Alcohol'], ['Gas', 'Smoke']];
const M = 3;            // number of samples (where digital_val = 0) before VENT ON
const N = -2;           // number of samples (where digital_val = 1) before VENT OFF
var dict = {device1:{sensor1:-3, sensor2:-3, vent:false}, device2:{sensor1:0, sensor2:0, vent:false}};


/////////////////////////////
///  IFTTT Notifications  ///
/////////////////////////////
var XMLHttpRequest = require('xhr2');
const iftttURL = 'https://maker.ifttt.com/trigger/send_text/json/with/key/bYCQFGaQJcC1ZZwaEpyzh5';

function sendText(a, b) {
    var Http = new XMLHttpRequest();
    Http.open("POST", iftttURL);
    Http.setRequestHeader("Content-Type", "application/json");
    Http.send('{"' + a + '":"' + b + '"}');
    Http.onreadystatechange = function () {
        if (Http.readyState === 4) {
            // console.log(Http.status);
            // console.log(Http.responseText);
            console.log("[TEXT SENT]");
        }
    };
}


////////////////////////
///  InfluxDB Setup  ///
////////////////////////
const {InfluxDB, Point} = require('@influxdata/influxdb-client');
const username = 'root';
const password = 'root';
const db_name = 'bajatest1';
const bucket = `${db_name}/${'autogen'}`;

function writeInflux(device, sensor, a, d) {
    const influxDB = new InfluxDB({ url: 'http://localhost:8086', token: `${username}:${password}`}).getWriteApi('', bucket);
    const point = new Point(device).tag('sensor', sensor).floatField('analog', a).floatField('digital', d);
    influxDB.writePoint(point);
    influxDB.close();
}


////////////////////////
///  Firebase Setup  ///
////////////////////////
var firebase = require('firebase/app');
const {getDatabase, ref, onValue, set, update, get} = require('firebase/database');
const firebaseConfig = {
    apiKey: "AIzaSyA_LepERT3pgP_ZV3A4918nauHB6eWlXjQ",
    authDomain: "gas-sensor-4ff34.firebaseapp.com",
    projectId: "gas-sensor-4ff34",
    storageBucket: "gas-sensor-4ff34.appspot.com",
    messagingSenderId: "505655438829",
    appId: "1:505655438829:web:ce6a1752bca49bd46a4be4",
    // measurementId: "G-RCBJSXDZP2",
    databaseURL: "https://gas-sensor-4ff34-default-rtdb.firebaseio.com/"
};

firebase.initializeApp(firebaseConfig);
const database = getDatabase();
// import { getAuth } from 'firebase/auth';
// const firebaseAuth = require('firebase/auth');
// const {getAuth} = require('firebase/auth');
// const auth = getAuth(firebase);

// Initialize all digital values negative until we know which sensors are in use
set(ref(database), {
    device1: {
        sensor1: {
            digital: N-1
        },
        sensor2: {
            digital: N-1
        }
    },
    device2: {
        sensor1: {
            digital: N-1
        },
        sensor2: {
            digital: N-1
        }
    }
});

// This function is used for updating analog/digital values in DB
function updateDB(path, a) {
    set(ref(database, path),a).catch((error) => {
        console.log("ERROR");
    });
}



async function main( )
{
    // Reference the BLE adapter and begin device discovery...
    const { bluetooth, destroy } = createBluetooth();
    const adapter = await bluetooth.defaultAdapter();
    const discovery =  await adapter.startDiscovery();
    console.log( 'discovering...' );

    // Attempt to connect to the device with specified BT address
    const device1 = await adapter.waitDevice( ARDUINO_BLUETOOTH_ADDR1.toUpperCase() );
    console.log( 'found device 1. attempting connection...' );
    await device1.connect();
    console.log( 'connected to device 1!' );

    // Get references to the desired UART service and its characteristics
    const gattServer1 = await device1.gatt();
    const uartService1 = await gattServer1.getPrimaryService( UART_SERVICE_UUID.toLowerCase() );
    const d1cmd = await uartService1.getCharacteristic( CMD_CHARACTERISTIC_UUID.toLowerCase() );
    const eesService1 = await gattServer1.getPrimaryService(EES_SERVICE_UUID.toLowerCase());
    const d1sensor1 = await eesService1.getCharacteristic(S1_CHARACTERISTIC_UUID.toLowerCase());
    console.log('UART and ESS initialized...');

    // Register for notifications on the characteristics
    await d1sensor1.startNotifications( );

    // Callbacks for when data is received from a sensor
    // Reads/converts the transmitted value
    // Prints the values, and sends them to update the DB
    d1sensor1.on( 'valuechanged', buffer =>
    {
        let lsb = buffer[0];
        let msb = buffer[1];
        let val = (lsb + (msb << 8));
        var d = parseInt(val.toString().substring(1,2));
        var a = parseInt(val.toString().substring(2));
        console.log('Device 1 Sensor 1:   digital - ' + d + '    analog - ' + a);

        // Update Firebase analog & digital values
        updateDB('/device1/sensor1/analog', a);
        updateDB('/device1/sensor1/digital', d);
        writeInflux('device1', 'sensor1', a, d);

        // Update digital value count
        if (d == 1) {
            dict['device1']['sensor1'] -= 1;
        } else {
            dict['device1']['sensor1'] += 1;
        }

        // Turn vent ON if...
        //   * the digital values from at leastone of the sensors
        //     must have been 0 for the last M samples
        //   * the device's vent is already off
        // Updates Firebase vent value
        // Sends VENT ON command to arduino
        // Calls sendText()
        if (dict['device1']['sensor1'] >= M && dict['device1']['vent'] == false) {
            dict['device1']['vent'] = true;
            update(ref(database, '/device1'), { vent: true });
            d1cmd.writeValue(Buffer.from('VENT ON')).then(() =>
            {
                console.log('[COMMAND SENT] - VENT ON');
            });
            sendText(sensorNames[0][0] + ' detected in the ' + deviceNames[0], 'Vent: ON');
        }

        // Turn vent OFF if...
        //   * the digital values from both sensors must have 
        //     been 1 for the last N samples
        //   * the device's vent is already on
        // Updates Firebase vent value
        // Sends VENT OFF command to arduino
        // Calls sendText()
        if (dict['device1']['sensor1'] <= N && dict['device1']['sensor2'] <= N && dict['device1']['vent'] == true) {
            dict['device1']['vent'] = false;
            update(ref(database, '/device1'), { vent: false });
            d1cmd.writeValue(Buffer.from('VENT OFF')).then(() =>
            {
                console.log('[COMMAND SENT] - VENT OFF');
            });
            sendText('All Clear - ' + deviceNames[0], 'Vent: OFF');
        }
    });

    // Listeners on both digital sensor values in Firebase 
    //  * if either digital value is changed from 0 to 1
    //    or 1 to 0, then the digital value count is reset 
    //  * if a digital value is changed to 1, then get 
    //    the other digital value, update vent to false
    //    if also equal to 1
    //  * any updates to the vent are sent to the arduino via d1cmd
    onValue(ref(database, '/device1/sensor1/digital'), (snapshot) => {
        const data = snapshot.val();
        if (data == 0 || data == 1) {
            dict['device1']['sensor1'] = 0;
        }

    });

    ///////////////////////////
    ///  DEVICE 1 SENSOR 2  ///
    ///////////////////////////
    if (numSensors1 == 2) {
        const d1sensor2 = await eesService1.getCharacteristic(S2_CHARACTERISTIC_UUID.toLowerCase());
        await d1sensor2.startNotifications( );
        d1sensor2.on( 'valuechanged', buffer =>
        {
            let lsb = buffer[0];
            let msb = buffer[1];
            let val = (lsb + (msb << 8));
            var d = parseInt(val.toString().substring(1,2));
            var a = parseInt(val.toString().substring(2));
            console.log('Device 1 Sensor 2:   digital - ' + d + '    analog - ' + a);

            updateDB('/device1/sensor2/analog', a);
            updateDB('/device1/sensor2/digital', d);
            writeInflux('device1', 'sensor2', a, d);

            if (d == 1) {
                dict['device1']['sensor2'] -= 1;
            } else {
                dict['device1']['sensor2'] += 1;
            }

            if (dict['device1']['sensor2'] >= M && dict['device1']['vent'] == false) {
                dict['device1']['vent'] = true;
                update(ref(database, '/device1'), { vent: true });
                d1cmd.writeValue(Buffer.from('VENT ON')).then(() => { console.log('[COMMAND SENT] - VENT ON'); });
                sendText(sensorNames[0][1] + ' detected in the ' + deviceNames[0], 'Vent: ON');
            }
            if (dict['device1']['sensor2'] <= N && dict['device1']['sensor1'] <= N && dict['device1']['vent'] == true) {
                dict['device1']['vent'] = false;
                update(ref(database, '/device1'), { vent: false });
                d1cmd.writeValue(Buffer.from('VENT OFF')).then(() => { console.log('[COMMAND SENT] - VENT OFF'); });
                sendText('All Clear - ' + deviceNames[0], 'Vent: OFF');
            }
        });

        onValue(ref(database, '/device1/sensor2/digital'), (snapshot) => {
            const data = snapshot.val();
            if (data == 0 || data == 1) {
                dict['device1']['sensor2'] = 0;
            }
        });
    }


    ////////////////////////////
    ///       DEVICE 2       ///
    ////////////////////////////
    if (numDevices == 2) {
        // Attempt to connect to the device with specified BT address
        const device2 = await adapter.waitDevice( ARDUINO_BLUETOOTH_ADDR2.toUpperCase() );
        console.log( 'found device 2. attempting connection...' );
        await device2.connect();
        console.log( 'connected to device 2!' );

        // Get references to the desired UART service and its characteristics
        const gattServer2 = await device2.gatt();
        const uartService2 = await gattServer2.getPrimaryService( UART_SERVICE_UUID.toLowerCase() );
        const d2cmd = await uartService2.getCharacteristic( CMD_CHARACTERISTIC_UUID.toLowerCase() );
        const eesService2 = await gattServer2.getPrimaryService(EES_SERVICE_UUID.toLowerCase());
        console.log('UART and ESS initialized...');

        ///////////////////////////
        ///  DEVICE 2 SENSOR 1  ///
        ///////////////////////////
        const d2sensor1 = await eesService2.getCharacteristic(S1_CHARACTERISTIC_UUID.toLowerCase());
        await d2sensor1.startNotifications( );
        d2sensor1.on( 'valuechanged', buffer =>
        {
            let lsb = buffer[0];
            let msb = buffer[1];
            let val = (lsb + (msb << 8));
            var d = parseInt(val.toString().substring(1,2));
            var a = parseInt(val.toString().substring(2));
            console.log('Device 2 Sensor 1:   digital - ' + d + '    analog - ' + a);
        
            updateDB('/device2/sensor1/analog', a);
            updateDB('/device2/sensor1/digital', d);
            writeInflux('device2', 'sensor1', a, d);

            if (d == 1) {
                dict['device2']['sensor1'] -= 1;
            } else {
                dict['device2']['sensor1'] += 1;
            }

            if (dict['device2']['sensor1'] >= M && dict['device2']['vent'] == false) {
                dict['device2']['vent'] = true;
                update(ref(database, '/device2'), { vent: true });
                d2cmd.writeValue(Buffer.from('VENT ON')).then(() => { console.log('[COMMAND SENT] - VENT ON'); });
                sendText(sensorNames[1][0] + ' detected in the ' + deviceNames[1], 'Vent: ON');
            }
            if (dict['device2']['sensor1'] <= N && dict['device2']['sensor2'] <= N && dict['device2']['vent'] == true) {
                dict['device2']['vent'] = false;
                update(ref(database, '/device2'), { vent: false });
                d2cmd.writeValue(Buffer.from('VENT OFF')).then(() => { console.log('[COMMAND SENT] - VENT OFF'); });
                sendText('All Clear - ' + deviceNames[1], 'Vent: OFF');
            }
        });

        onValue(ref(database, '/device2/sensor1/digital'), (snapshot) => {
            const data = snapshot.val();
            if (data == 0 || data == 1) {
                dict['device2']['sensor1'] = 0;
            }
        });


        ///////////////////////////
        ///  DEVICE 2 SENSOR 2  ///
        ///////////////////////////
        if (numSensors2 == 2) {
            const d2sensor2 = await eesService2.getCharacteristic(S1_CHARACTERISTIC_UUID.toLowerCase());
            await d2sensor2.startNotifications( );
            d2sensor2.on( 'valuechanged', buffer =>
            {
                let lsb = buffer[0];
                let msb = buffer[1];
                let val = (lsb + (msb << 8));
                var d = parseInt(val.toString().substring(1,2));
                var a = parseInt(val.toString().substring(2));
                console.log('Device 2 Sensor 2:   digital - ' + d + '    analog - ' + a);
                
                updateDB('/device2/sensor2/analog', a);
                updateDB('/device2/sensor2/digital', d);
                writeInflux('device2', 'sensor2', a, d);

                if (d == 1) {
                    dict['device2']['sensor2'] -= 1;
                } else {
                    dict['device2']['sensor2'] += 1;
                }

                if (dict['device2']['sensor2'] >= M && dict['device2']['vent'] == false) {
                    dict['device2']['vent'] = true;
                    update(ref(database, '/device2'), { vent: true });
                    d2cmd.writeValue(Buffer.from('VENT ON')).then(() => { console.log('[COMMAND SENT] - VENT ON'); });
                    sendText(sensorNames[1][1] + ' detected in the ' + deviceNames[1], 'Vent: ON');
                }
                if (dict['device2']['sensor2'] <= N && dict['device2']['sensor1'] <= N && dict['device2']['vent'] == true) {
                    dict['device2']['vent'] = false;
                    update(ref(database, '/device2'), { vent: false });
                    d2cmd.writeValue(Buffer.from('VENT OFF')).then(() => { console.log('[COMMAND SENT] - VENT OFF'); });
                    sendText('All Clear - ' + deviceNames[1], 'Vent: OFF');
                }
            });

            onValue(ref(database, '/device2/sensor2/digital'), (snapshot) => {
                const data = snapshot.val();
                if (data == 0 || data == 1) {
                    dict['device2']['sensor2'] = 0;
                }
            });
        }
    }

}

main().then((ret) =>
{
    if (ret) console.log( ret );
}).catch((err) =>
{
    if (err) console.error( err );
});
