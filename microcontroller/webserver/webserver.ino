/*

WiFi Web Server Controller

By redazzo, based on Simple Web Server by Tom Igoe

*/
#include <SPI.h>
#include <ArduinoMqttClient.h>
#include <WiFiNINA.h>
#include <utility/wifi_drv.h>
#include <BlockNot.h>
#include "arduino_secrets.h"


///////please enter your sensitive data in the Secret tab/arduino_secrets.h
char ssid[] = SECRET_SSID;                        // your network SSID (name)
char pass[] = SECRET_PASS;                        // your network password (use for WPA, or use as key for WEP)

int keyIndex = 0;                                 // your network key index number (needed only for WEP)

const char MQTT_SERVER[] = "broker.emqx.io";
const int MQTT_PORT = 1883;
const char MQTT_TOPIC[] = MQTT_GUID_IP;               // GUID for your ip address queue
const char MQTT_STATUS_TOPIC[] = MQTT_GUID_STATUS;    // GUID for your status queue


int DIODE_PIN = 9;
int RELAY_PIN = 11;
int RED_PIN = 25;
int GREEN_PIN = 26;
int BLUE_PIN = 27;

int status = WL_IDLE_STATUS;

WiFiClient wifiClient;
MqttClient mqttClient(wifiClient);
WiFiServer server(80);

enum alarm_status {
  disarmed = 0,
  armed = 1,
  triggered = 2
};


BlockNot tenSecondTimer(10, SECONDS); //Whole Seconds timer    

void setup() {

  pinMode(DIODE_PIN, OUTPUT);      // set the LED pin mode
  pinMode(RELAY_PIN, OUTPUT);
  WiFiDrv::pinMode(RED_PIN, OUTPUT);
  WiFiDrv::pinMode(GREEN_PIN, OUTPUT);
  WiFiDrv::pinMode(BLUE_PIN, OUTPUT);

  digitalWrite(LED_BUILTIN, LOW);
  setStatusRED();
 

  Serial.begin(9600);      // initialize serial communication


  // check for the WiFi module:
  if (WiFi.status() == WL_NO_MODULE) {
    Serial.println("Communication with WiFi module failed!");
    // don't continue
    while (true);
  }

  String fv = WiFi.firmwareVersion();
  if (fv < WIFI_FIRMWARE_LATEST_VERSION) {
    Serial.println("Please upgrade the firmware");
  }

  // attempt to connect to WiFi network:
  while (status != WL_CONNECTED) {
    setStatusBLUE();
    Serial.print("Attempting to connect to Network named: ");
    Serial.println(ssid);                   // print the network name (SSID);

    // Connect to WPA/WPA2 network. Change this line if using open or WEP network:
    status = WiFi.begin(ssid, pass);
    // wait 10 seconds for connection:
    delay(10000);
  }

  printWifiStatus();

  int res = connectToMQTT();
  if (res == 0) {
    digitalWrite(LED_BUILTIN, HIGH);
    setStatusGREEN();
  }

  digitalWrite(DIODE_PIN, LOW);
  digitalWrite(RELAY_PIN, LOW);
  
  server.begin();                           // start the web server on port 80
                          // you're connected now, so print out the status
}


void loop() {

  if (tenSecondTimer.TRIGGERED) {

    Serial.println("Transmitting IP to MQTT broker");
    mqttClient.beginMessage(MQTT_TOPIC);
    //WiFi.localIP().fromString()
    mqttClient.print(WiFi.localIP());
    mqttClient.endMessage();
    
  }

  WiFiClient client = server.available();   // listen for incoming clients

  if (client) {                             // if you get a client,
    Serial.println("new client");           // print a message out the serial port
    String currentLine = "";                // make a String to hold incoming data from the client
    while (client.connected()) {            // loop while the client's connected
      if (client.available()) {             // if there's bytes to read from the client,
        char c = client.read();             // read a byte, then
        Serial.write(c);                    // print it out to the serial monitor
        if (c == '\n') {                    // if the byte is a newline character

          // Read the current values
          PinStatus ledStatus = digitalRead(9);
          PinStatus relayStatus = digitalRead(11);
        

          // if the current line is blank, you got two newline characters in a row.
          // that's the end of the client HTTP request, so send a response:
          if (currentLine.length() == 0) {
            // HTTP headers always start with a response code (e.g. HTTP/1.1 200 OK)
            // and a content-type so the client knows what's coming, then a blank line:
            client.println("HTTP/1.1 200 OK");
            client.println("Content-type:text/html");
            client.println();

            // the content of the HTTP response follows the header:
            client.println("Led status: ");
            if (ledStatus == HIGH){
              client.print("HIGH<br>");
            } else {
              client.print("LOW<br>");
            }

            client.println("Relay status: ");
            if (relayStatus == HIGH){
              client.print("CLOSED<br>");
            } else {
              client.print("OPEN<br>");
            }

            client.print("Click <a href=\"/H\">here</a> turn the LED on pin 9 on<br>");
            client.print("Click <a href=\"/L\">here</a> turn the LED on pin 9 off<br>");
            client.print("Click <a href=\"/C\">here</a> close the relay on pin 11<br>");
            client.print("Click <a href=\"/O\">here</a> open the relay on pin 11<br>");
            client.print("Click <a href=\"/LR\">here</a> turn the main LED red<br>");
            client.print("Click <a href=\"/LY\">here</a> turn the main LED yellow<br>");
            client.print("Click <a href=\"/LG\">here</a> turn the main LED green<br>");


            // The HTTP response ends with another blank line:
            client.println();
            // break out of the while loop:
            break;
          } else {    // if you got a newline, then clear currentLine:
            currentLine = "";
          }
        } else if (c != '\r') {  // if you got anything else but a carriage return character,
          currentLine += c;      // add it to the end of the currentLine
        }

        // Check the client http request
        if (currentLine.endsWith("GET /H")) {
          digitalWrite(DIODE_PIN,HIGH);        
        }
        if (currentLine.endsWith("GET /L")) {
          digitalWrite(DIODE_PIN, LOW);
        }
        if (currentLine.endsWith("GET /C")) { 
          digitalWrite(RELAY_PIN, HIGH);            
        }
        if (currentLine.endsWith("GET /O")) {
          digitalWrite(RELAY_PIN, LOW);
        }

        // LED colour
        if (currentLine.endsWith("GET /LR")) {
          setStatusLED(HIGH, LOW, LOW);
        }
        if (currentLine.endsWith("GET /LY")) {
          setStatusLED(HIGH, HIGH, LOW);
        }
        if (currentLine.endsWith("GET /LG")) {
          setStatusLED(LOW, HIGH, LOW);
        }
      }
    }
    // close the connection:
    client.stop();
    Serial.println("client disconnected");
  }
}

void printWifiStatus() {
  // print the SSID of the network you're attached to:
  Serial.print("SSID: ");
  Serial.println(WiFi.SSID());

  // print your board's IP address:
  IPAddress ip = WiFi.localIP();
  Serial.print("IP Address: ");
  Serial.println(ip);

  // print the received signal strength:
  long rssi = WiFi.RSSI();
  Serial.print("signal strength (RSSI):");
  Serial.print(rssi);
  Serial.println(" dBm");
  // print where to go in a browser:
  Serial.print("To see this page in action, open a browser to http://");
  Serial.println(ip);
}

int connectToMQTT() {

  setStatusPURPLE();
  Serial.print("Attempting to connect to MQTT broker ...");
  Serial.println();

  Serial.println(MQTT_SERVER);

  if (!mqttClient.connect(MQTT_SERVER, MQTT_PORT)) {

    Serial.print("MQTT connection failed! Error code = ");
    Serial.println(mqttClient.connectError());
    
    return -1;

  } else {
    Serial.println("You're connected to the MQTT broker!");
  }
  return 0;
}

void setStatusRED() {
   setStatusLED(HIGH, LOW, LOW);
}

void setStatusGREEN() {
  setStatusLED(LOW, HIGH, LOW);
}

void setStatusBLUE() {
  setStatusLED(LOW, LOW, HIGH);
}

void setStatusPURPLE() {
  setStatusLED(HIGH, LOW, HIGH);
}

void setStatusLED(PinStatus redStatus, PinStatus greenStatus, PinStatus blueStatus) {
  WiFiDrv::digitalWrite(RED_PIN, redStatus);
  WiFiDrv::digitalWrite(GREEN_PIN, greenStatus);
  WiFiDrv::digitalWrite(BLUE_PIN, blueStatus);  
}
