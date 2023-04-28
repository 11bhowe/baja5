
var firebase = require( 'firebase/app' );

const { getDatabase, ref, onValue, set, update, get } = require('firebase/database');


// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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


console.log("got here")



firebase.initializeApp( firebaseConfig )
const database = getDatabase();


var Device2Sensor1lastHundo = []

function GetData(){
    get(ref(database)).then((snapshot) => {
            var data = snapshot.val().device2.sensor1.analog;
            Device2Sensor1lastHundo.push(data)
            console.log("device2,sensor1: "+data);
            if(len(Device2Sensor1lastHundo)>100){
                Device2Sensor1lastHundo.splice(1,0);//remove index 1 of array
            }
    });
    return Device2Sensor1lastHundo;
}

function arrAvg(array){
    var total = 0;
    var count = 0;

    jQuery.each(array, function(index, value) {
        total += value;
        count++;
    });

    return total / count;

}

GetData();


/*
onValue(ref(database,'Interval'), (snapshot) => {
    interval = snapshot.val();
    console.log("The Interval changed to %d seconds", interval);
    clearInterval(interv)
    interv = setInterval(GetHumidiy,interval*1000);
});

*/
   