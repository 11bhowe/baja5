#!/usr/bin/env python3
import paho.mqtt.client as mqtt
import json
import time
from influxdb import InfluxDBClient
import pprint   #pretty printer to print dictionary
point_data = {}
def on_connect(client, userdata, flags, rc):
    print("Connected with result code "+str(rc))
    client.subscribe("uiowa/iot/lab4/#")

def on_message(client, userdata, msg):
    print("Received a message on topic: " + msg.topic)
    m_decode=str(msg.payload.decode("utf-8", "ignore"))
    print("type of decoded message payload is: " + str(type(m_decode)))
    msg_payload = json.loads(m_decode)
    print("Type of msg_payload after json.loads() is: " + str(type(msg_payload)))
    print("Contents of message payload: ")
    pp = pprint.PrettyPrinter(indent=2)
    pp.pprint(msg_payload)
    point_data["measurement"] = msg.topic[-4:]
    point_data["fields"] = {'usage':float(msg_payload)}
    influx_client.write_points( [ point_data ] )

# Initialize the InfluxDB client
# TODO
influx_client = InfluxDBClient(host='localhost', port=8086, username='AustinAlec',password='simple', database='lab4test')

#influx_client.write_points( [ point_data ] )
# Initialize the MQTT client that should connect to the Mosquitto broker
mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message
connOK=False
while(connOK == False):
    try:
        mqtt_client.connect("broker.hivemq.com", 1883, 60)
        connOK = True
    except:
        connOK = False
    time.sleep(1)

# Blocking loop to the Mosquitto broker
mqtt_client.loop_forever()
