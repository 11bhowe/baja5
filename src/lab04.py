#!/usr/bin/env python3
import paho.mqtt.client as mqtt
import json
import time
from influxdb import InfluxDBClient
import socket
import tkinter as tk
import random
import matplotlib.animation as animation
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
influx_client = InfluxDBClient(url='https://maker.ifttt.com/trigger/send_text/json/with/key/bYCQFGaQJcC1ZZwaEpyzh5'
, port=8086, username='root',password='root', database='bajatest1')

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
arr = [] #data array

def animate(i):

    #data = get data from influxdb
    print(data)
    if (data.decode('utf-8') == ''):
        #client_socket.close()
        #the lab manual says if I don't get data I should leave a null space in the graph
        data = '000.000'
    else:
        data = eval(data[:5])
    arr.append(data)

    ax1.plot(arr)

    plt.xlabel("Time (sec)")
    plt.ylabel("sensor ("+1+")")
    plt.title("sensor vs Time")



# GUI from senior design project
mqtt_client.loop_forever()

if __name__ == '__main__':

    SensorStatus = "Sensor Plugged in"
    BoxStatus = "Box OFF"




    window = tk.Tk()
    for i in range(4):
        window.columnconfigure(i, weight=1, minsize=75)
        window.rowconfigure(i, weight=1, minsize=50)

        for j in range(0, 3):
            frame = tk.Frame(
                master=window,
                relief=tk.RAISED,
                borderwidth=1
            )
            frame.grid(row=i, column=j, padx=5, pady=5)

    greeting = tk.Label(text=SensorStatus)
    greeting.grid(row =0, column=0)
    #frame = tk.Frame(master=window, height=200, width=200)
    labelBox = tk.Label(text=BoxStatus)
    FButton = tk.Button(
        text="Device 1",
        width=10,
        height=5,
        bg="red",
        fg="yellow",
    )
    CButton = tk.Button(
        text="Device 2",
        width=10,
        height=5,
        bg="yellow",
        fg="black",
    )


    maxLabel = tk.Button(text="Set MAX")
    Tmax = tk.Text(height=2, width=20)
    minLabel = tk.Button(text="Set MIN")
    Tmin = tk.Text(height=2, width=20)
    FButton.bind("<Button-1>", None)
    CButton.bind("<Button-1>", None)
    maxLabel.bind("<Button-1>", None)
    minLabel.bind("<Button-1>", None)


    #I think we need 1 number in the GUI that just displays the current temp
    #This will only run once

    labelBox.grid(row =1, column=0)
    greeting.grid(row =2, column=0)
    maxLabel.grid(row=0, column=3)
    Tmax.grid(row=1,column=3)
    minLabel.grid(row=2, column=3)
    Tmin.grid(row=3,column=3)
    FButton.grid(row=1, column=1)
    CButton.grid(row=2, column=1)
    window.mainloop() #blocks code after it till the window is closed