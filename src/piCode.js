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
var dict = {device1:{sensor1:{c:-3, d:-1}, sensor2:{c:-3, d:-1}, vent:false}, device2:{sensor1:{c:-3, d:-1}, sensor2:{c:-3, d:-1}, vent:false}};


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
            console.log("[TEXT SENT]");
        }
    };
}


////////////////////////
///  InfluxDB Setup  ///
////////////////////////
const {InfluxDB, Point, consoleLogger} = require('@influxdata/influxdb-client');
const username = 'root';
const password = 'root';
const db_name = 'bajatest1';
const bucket = `${db_name}/${'autogen'}`;

// This function writes analog and digital values to the
// corresponding device point in the DB with a sensor tag 
function writeInflux1(device, sensor, a, d) {
    const influxDB = new InfluxDB({ url: 'http://localhost:8086', token: `${username}:${password}`}).getWriteApi('', bucket);
    const point = new Point(device).tag('sensor', sensor).floatField('analog', a).floatField('digital', d);
    influxDB.writePoint(point);
    influxDB.close();
}

// Only writes vent status when on/off value is changed
function writeInflux2(device, onOff) {
    const influxDB = new InfluxDB({ url: 'http://localhost:8086', token: `${username}:${password}`}).getWriteApi('', bucket);
    const point = new Point(device).booleanField('vent', onOff);
    influxDB.writePoint(point);
    influxDB.close();
    console.log("INFLUX - VENT : " , onOff);
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

        // Update InfluxDB 
        writeInflux1('device1', 'sensor1', a, d);

        // Update digital value count
        if (d == 1) {
            dict['device1']['sensor1']['c'] -= 1;
        } else {
            dict['device1']['sensor1']['c'] += 1;
        }

        // Turn vent ON if...
        //   * the digital values from at leastone of the sensors
        //     must have been 0 for the last M samples
        //   * the device's vent is already off
        // Sends VENT ON command to arduino
        // Calls sendText()
        // Updates InfluxDB vent value
        if (d == 0 && dict['device1']['sensor1']['c'] >= M && dict['device1']['vent'] == false) {
            dict['device1']['vent'] = true;
            d1cmd.writeValue(Buffer.from('VENT ON')).then(() =>
            {
                console.log('[COMMAND SENT] - VENT ON');
            });
            sendText(sensorNames[0][0] + ' detected in the ' + deviceNames[0], 'Vent: ON');
            writeInflux2('device1', true);
        }

        // Turn vent OFF if...
        //   * the digital values from both sensors must have 
        //     been 1 for the last N samples
        //   * the device's vent is already on
        // Sends VENT OFF command to arduino
        // Calls sendText()
        // Updates InfluxDB vent value
        if (d == 1 && dict['device1']['sensor1']['c'] <= N && dict['device1']['sensor2']['c'] <= N && dict['device1']['vent'] == true) {
            dict['device1']['vent'] = false;
            d1cmd.writeValue(Buffer.from('VENT OFF')).then(() =>
            {
                console.log('[COMMAND SENT] - VENT OFF');
            });
            sendText('All Clear - ' + deviceNames[0], 'Vent: OFF');
            writeInflux2('device1', false);
        }

        // This code replaces the functionality Firebase had
        // Sensor count is reset when digital value changes
        if (d != dict['device1']['sensor1']['d'] && dict['device1']['sensor1']['d'] != -1) {
            dict['device1']['sensor1']['c'] = 0;
        }
        dict['device1']['sensor1']['d'] = d;
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

            writeInflux1('device1', 'sensor2', a, d);

            if (d == 1) {
                dict['device1']['sensor2']['c'] -= 1;
            } else {
                dict['device1']['sensor2']['c'] += 1;
            }

            if (d == 0 && dict['device1']['sensor2']['c'] >= M && dict['device1']['vent'] == false) {
                dict['device1']['vent'] = true;
                d1cmd.writeValue(Buffer.from('VENT ON')).then(() => { console.log('[COMMAND SENT] - VENT ON'); });
                sendText(sensorNames[0][1] + ' detected in the ' + deviceNames[0], 'Vent: ON');
                writeInflux2('device1', true);
            }
            if (d == 1 && dict['device1']['sensor2']['c'] <= N && dict['device1']['sensor1']['c'] <= N && dict['device1']['vent'] == true) {
                dict['device1']['vent'] = false;
                d1cmd.writeValue(Buffer.from('VENT OFF')).then(() => { console.log('[COMMAND SENT] - VENT OFF'); });
                sendText('All Clear - ' + deviceNames[0], 'Vent: OFF');
                writeInflux2('device1', false);
            }

            if (d != dict['device1']['sensor2']['d'] && dict['device1']['sensor2']['d'] != -1) {
                dict['device1']['sensor2']['c'] = 0;
            }
            dict['device1']['sensor2']['d'] = d;
        });
    }


    ////////////////////////////
    ///       DEVICE 2       ///
    ////////////////////////////
    if (numDevices == 2) {
        const device2 = await adapter.waitDevice( ARDUINO_BLUETOOTH_ADDR2.toUpperCase() );
        console.log( 'found device 2. attempting connection...' );
        await device2.connect();
        console.log( 'connected to device 2!' );

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
        
            writeInflux1('device2', 'sensor1', a, d);

            if (d == 1) {
                dict['device2']['sensor1']['c'] -= 1;
            } else {
                dict['device2']['sensor1']['c'] += 1;
            }

            if (dict['device2']['sensor1']['c'] >= M && dict['device2']['vent'] == false) {
                dict['device2']['vent'] = true;
                d2cmd.writeValue(Buffer.from('VENT ON')).then(() => { console.log('[COMMAND SENT] - VENT ON'); });
                sendText(sensorNames[1][0] + ' detected in the ' + deviceNames[1], 'Vent: ON');
                writeInflux2('device2', true);
            }
            if (dict['device2']['sensor1']['c'] <= N && dict['device2']['sensor2']['c'] <= N && dict['device2']['vent'] == true) {
                dict['device2']['vent'] = false;
                d2cmd.writeValue(Buffer.from('VENT OFF')).then(() => { console.log('[COMMAND SENT] - VENT OFF'); });
                sendText('All Clear - ' + deviceNames[1], 'Vent: OFF');
                writeInflux2('device2', false);
            }

            if (d != dict['device2']['sensor1']['d'] && dict['device2']['sensor1']['d'] != -1) {
                dict['device2']['sensor1']['c'] = 0;
            }
            dict['device2']['sensor1']['d'] = d;
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
                
                writeInflux1('device2', 'sensor2', a, d);

                if (d == 1) {
                    dict['device2']['sensor2']['c'] -= 1;
                } else {
                    dict['device2']['sensor2']['c'] += 1;
                }

                if (dict['device2']['sensor2']['c'] >= M && dict['device2']['vent'] == false) {
                    dict['device2']['vent'] = true;
                    d2cmd.writeValue(Buffer.from('VENT ON')).then(() => { console.log('[COMMAND SENT] - VENT ON'); });
                    sendText(sensorNames[1][1] + ' detected in the ' + deviceNames[1], 'Vent: ON');
                    writeInflux2('device2', true);
                }
                if (dict['device2']['sensor2']['c'] <= N && dict['device2']['sensor1']['c'] <= N && dict['device2']['vent'] == true) {
                    dict['device2']['vent'] = false;
                    d2cmd.writeValue(Buffer.from('VENT OFF')).then(() => { console.log('[COMMAND SENT] - VENT OFF'); });
                    sendText('All Clear - ' + deviceNames[1], 'Vent: OFF');
                    writeInflux2('device2', false);
                }

                if (d != dict['device2']['sensor2']['d'] && dict['device2']['sensor2']['d'] != -1) {
                    dict['device2']['sensor2']['c'] = 0;
                }
                dict['device2']['sensor2']['d'] = d;
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
