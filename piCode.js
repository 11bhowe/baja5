const { createBluetooth } = require( 'node-ble' );

const ARDUINO_BLUETOOTH_ADDR1 = '4E:4F:19:3B:D9:BE';
const ARDUINO_BLUETOOTH_ADDR2 = 'FE:EF:08:21:BD:2D';

const UART_SERVICE_UUID      = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const CMD_CHARACTERISTIC_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';

const EES_SERVICE_UUID       = '0000181a-0000-1000-8000-00805f9b34fb';
const S1_CHARACTERISTIC_UUID = '00002a56-0000-1000-8000-00805f9b34fb';
const S2_CHARACTERISTIC_UUID = '00002a57-0000-1000-8000-00805f9b34fb';

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
const numDevices = 1;

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
    const d1sensor2 = await eesService1.getCharacteristic(S2_CHARACTERISTIC_UUID.toLowerCase());
    console.log('UART and ESS initialized...');

    // Register for notifications on the characteristics
    await d1sensor1.startNotifications( );
    await d1sensor2.startNotifications( );

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

        updateDB('/device1/sensor1/analog', a);
        updateDB('/device1/sensor1/digital', d);

    });
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
    });


    // Listeners on both digital sensor values in Firebase 
    //  * if either digital value is changed to 0 in DB, 
    //    the vent value is updated to true
    //  * if a digital value is changed to 1, then get 
    //    the other digital value, update vent to false
    //    if also equal to 1
    //  * any updates to the vent are sent to the arduino via d1cmd
    onValue(ref(database, '/device1/sensor1/digital'), (snapshot) => {
        const data = snapshot.val();
        if (data == 0) {
            update(ref(database, '/device1'), { vent: true });
            d1cmd.writeValue(Buffer.from('VENT ON')).then(() =>
            {
                console.log('Sent: VENT ON');
            });
        }
        if (data == 1) {
            get(ref(database, '/device1/sensor2/digital')).then((snapshot1) => {
                const d = snapshot1.val();
                if (d == 1) {
                    update(ref(database, '/device1'), { vent: false });
                    d1cmd.writeValue(Buffer.from('VENT OFF')).then(() =>
                    {
                        console.log('Sent: VENT OFF');
                    });
                }
            });
        }
    });
    onValue(ref(database, '/device1/sensor2/digital'), (snapshot) => {
        const data = snapshot.val();
        if (data == 0) {
            update(ref(database, '/device1'), { vent: true });
            d1cmd.writeValue(Buffer.from('VENT ON')).then(() =>
            {
                console.log('Sent: VENT ON');
            });
        }
        if (data == 1) {
            get(ref(database, '/device1/sensor1/digital')).then((snapshot1) => {
                const d = snapshot1.val();
                if (d == '1') {
                    update(ref(database, '/device1'), { vent: false });
                    d1cmd.writeValue(Buffer.from('VENT OFF')).then(() =>
                    {
                        console.log('Sent: VENT OFF');
                    });
                }
            });
        }
    });


    // CODE FOR 2nd ARDUINO
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
        const d2sensor1 = await eesService2.getCharacteristic(S1_CHARACTERISTIC_UUID.toLowerCase());
        const d2sensor2 = await eesService2.getCharacteristic(S1_CHARACTERISTIC_UUID.toLowerCase());

        // Register for notifications on the characteristics
        await d2sensor1.startNotifications( );
        await d2sensor2.startNotifications( );

        // Callbacks for when data is received on sensors
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
        });
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
        });

        // Listeners for each digital sensor value in Firebase 
        onValue(ref(database, '/device2/sensor1/digital'), (snapshot) => {
            const data = snapshot.val();
            if (data == 0) {
                update(ref(database, '/device2'), { vent: true });
                d2cmd.writeValue(Buffer.from('VENT ON')).then(() =>
                {
                    console.log('Sent: VENT ON');
                });
            }
            if (data == 1) {
                get(ref(database, '/device2/sensor2/digital')).then((snapshot1) => {
                    const d = snapshot1.val();
                    if (d == 1) {
                        update(ref(database, '/device2'), { vent: false });
                        d2cmd.writeValue(Buffer.from('VENT OFF')).then(() =>
                        {
                            console.log('Sent: VENT OFF');
                        });
                    }
                });
            }
        });
        onValue(ref(database, '/device2/sensor2/digital'), (snapshot) => {
            const data = snapshot.val();
            if (data == 0) {
                update(ref(database, '/device2'), { vent: true });
                d2cmd.writeValue(Buffer.from('VENT ON')).then(() =>
                {
                    console.log('Sent: VENT ON');
                });
            }
            if (data == 1) {
                get(ref(database, '/device2/sensor1/digital')).then((snapshot1) => {
                    const d = snapshot1.val();
                    if (d == 1) {
                        update(ref(database, '/device2'), { vent: false });
                        d2cmd.writeValue(Buffer.from('VENT OFF')).then(() =>
                        {
                            console.log('Sent: VENT OFF');
                        });
                    }
                });
            }
        });

    }

}

main().then((ret) =>
{
    if (ret) console.log( ret );
}).catch((err) =>
{
    if (err) console.error( err );
});

