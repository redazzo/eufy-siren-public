import {eufySecurityConfig} from "./config";
import {Device, EufySecurity, PropertyValue, Station} from "eufy-security-client";
import fetch from "node-fetch";
import * as mqtt from "mqtt";
import * as http from "http";


const BASE_SN: string = "<The serial no. of your base station>";
const MQTT_BROKER_URL: string = "mqtt://broker.emqx.io:1883";
const IP_ADDRESS_TOPIC: string = "<guid>/ipaddress";
const ALARM_STATUS_TOPIC: string = "<guid>/status";
const HTTP_SERVER_PORT: number = 8080;

enum AlarmStatusValue {
    DISARMED = "DISARMED",
    ARMED = "ARMED",
    TRIGGERED = "TRIGGERED",
    UNDEFINED = "UNDEFINED",
}

enum BooleanState {
    TRUE = "TRUE",
    FALSE = "FALSE",
    UNDEFINED = "UNDEFINED",
}

enum RelayState {
    OPEN = "OPEN",
    CLOSED = "CLOSED",
    UNDEFINED = "UNDEFINED",
}

enum LEDBarState {
    RED = "LR",
    YELLOW = "LY",
    GREEN = "LG",
    UNDEFINED = "UNDEFINED",
}

let alarmStatus: AlarmStatusValue = AlarmStatusValue.DISARMED;

async function main() {

    let controller = new Controller();
    let home = new Home("15 Stratton Street", controller);

    initHTTPServer(controller);

    await home.connectToEufy();
    await controller.init();
    await controller.testRelay();

    controller.led.state = BlinkingState.BLINKING_SLOW;

}

function initHTTPServer(controller: Controller) {
    let server = http.createServer(function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write("<!DOCTYPE html>");
        res.write("<meta http-equiv=\"refresh\" content=\"5\">");
        res.write("<html><body><h1>Relay IP Address: " + controller.ipAddress + "</h1></body></html>");
        res.write("<html><body><h1>" + alarmStatus + "</h1></body></html>");
        res.end();
    });
    server.listen(HTTP_SERVER_PORT);

    console.log("Server running on port " + HTTP_SERVER_PORT);
}

export class EufyConnection {

    private client!: EufySecurity;

    private readonly baseSN: string;

    public constructor(baseSN: string) {
        this.baseSN = baseSN;
    }

    public async initialise(): Promise<EufySecurity> {
        this.client = await EufySecurity.initialize(eufySecurityConfig);
        return this.client
    }

    public async getBase(): Promise<Station> {
        return await this.client.getStation(this.baseSN);
    }

    public async getDevices(): Promise<any> {
        return await this.client.getDevices();
    }
}

class Controller {

    private _ipAddress: string = "UNDEFINED";
    private _relayStatus: RelayState = RelayState.UNDEFINED;
    private _led!: LED;
    private _ledBarStatus: LEDBarState = LEDBarState.UNDEFINED;

    public constructor() {
        this._led = new LED(this);
    }

    get ipAddress(): string {
        return this._ipAddress;
    }

    get led(): LED {
        return this._led;
    }

    get relayStatus(): RelayState {
        return this._relayStatus;
    }

    get ledBar(): LEDBarState {
        return this._ledBarStatus;
    }

    public async testRelay() {
        console.log("Testing relay ... ");
        await this.closeRelay(true);
        await sleep(1000);
        await this.closeRelay(false);
    }

    public async closeRelay(closeRelay: boolean): Promise<void> {
        const closeRelayTxt = closeRelay ? "C" : "O";
        try {
            const response = await fetch(`http://${this._ipAddress}/${closeRelayTxt}`);

            if (response.status != 200) {
                console.log("Error setting relay: " + response.status);
                this._relayStatus = RelayState.UNDEFINED;
            }

        } catch (error) {
            console.log("Error setting relay: " + error);
            this._relayStatus = RelayState.UNDEFINED;
        }
        this._relayStatus = closeRelay ? RelayState.CLOSED : RelayState.OPEN;
    }

    public async setBarColour(colour: LEDBarState): Promise<void> {

        try {
            const response = await fetch(`http://${this._ipAddress}/${colour}`);

            if (response.status != 200) {
                console.log("Error setting LED bar: " + response.status);
                this._ledBarStatus = LEDBarState.UNDEFINED;
            } else {
                this._ledBarStatus = colour;
            }

        } catch (error) {
            console.log("Error setting relay: " + error);
            this._ledBarStatus = LEDBarState.UNDEFINED;
        }
    }

    public async init() {

        console.log("Waiting for IP address of relay - Connecting to MQTT broker ...");

        const mqttClient = mqtt.connect(MQTT_BROKER_URL);

        console.log("Connected to MQTT broker ...");

        mqttClient.on("connect", async () => {
            mqttClient.subscribe(IP_ADDRESS_TOPIC);
        });

        let outerThis = this;

        mqttClient.on('message', function (topic, message) {
            const newIPAddress = message.toString();
            if (outerThis._ipAddress != newIPAddress) {
                console.log("IP Address updated: " + message.toString());
                outerThis._ipAddress = message.toString();
            }
        });

        while (this._ipAddress == "UNDEFINED") {
            await sleep(1000);
        }
    }
}

enum BlinkingState {
    ALWAYS_ON = "ALWAYS_ON",
    ALWAYS_OFF = "ALWAYS_OFF",
    BLINKING_FAST = "BLINKING_FAST",
    BLINKING_SLOW = "BLINKING_SLOW",
    UNDEFINED = "UNDEFINED",
}

class LED {

    private _state: BlinkingState = BlinkingState.UNDEFINED;
    private _ledStatus: BooleanState = BooleanState.UNDEFINED;

    private readonly SLOW_BLINK_DELAY = 1000;
    private readonly FAST_BLINK_DELAY = 250;

    private timer!: NodeJS.Timeout | undefined;

    private _parent!: Controller;

    public constructor(parent: Controller) {
        this._parent = parent;
    }

    public get state(): BlinkingState {
        return this._state;
    }

    public set state(value: BlinkingState) {

        console.log("Setting LED state to: " + value);

        this._state = value
        if (value == BlinkingState.ALWAYS_ON || value == BlinkingState.ALWAYS_OFF) {
            if (this.timer != undefined) clearInterval(this.timer);
            this.timer = undefined;

            if (value == BlinkingState.ALWAYS_ON) {
                this.setLED(true);
            }
            if (value == BlinkingState.ALWAYS_OFF) {
                this.setLED(false);
            }
        } else if (value == BlinkingState.BLINKING_FAST) {
            this.blink(this.FAST_BLINK_DELAY);
        } else if (value == BlinkingState.BLINKING_SLOW) {
            this.blink(this.SLOW_BLINK_DELAY);
        }

    }

    private async blink(blinkDelay: number) {

        if (this.timer != undefined) await clearInterval(this.timer);

        this.timer = setInterval(async () => {
            await this.setLED(true);
            await sleep(blinkDelay);
            await this.setLED(false);
            await sleep(blinkDelay);
        }, blinkDelay * 3);

    }

    private async setLED(ledOn: boolean): Promise<void> {
        const ledOnTxt = ledOn ? "H" : "L";
        try {
            const response = await fetch(`http://${this._parent.ipAddress}/${ledOnTxt}`);

            if (response.status != 200) {
                console.log("Error setting LED: " + response.status);
                this._ledStatus = BooleanState.UNDEFINED;
                this._state = BlinkingState.UNDEFINED;
            }

        } catch (error) {
            console.log("Error setting LED: " + error);
            this._ledStatus = BooleanState.UNDEFINED;
            this._state = BlinkingState.UNDEFINED;
        }
        this._ledStatus = ledOn ? BooleanState.TRUE : BooleanState.FALSE;
    }
}

class Home {

    private readonly _name: string;
    private _controller!: Controller;
    private readonly _devices: Device[] = [];

    public constructor(name: string, controller: Controller) {
        this._name = name;
        this._controller = controller;
    }

    get name(): string {
        return this._name;
    }

    get devices(): Device[] {
        return this._devices;
    }

    get controller(): Controller {
        return this._controller;
    }

    public async connectToEufy() {
        console.log("Connecting to Eufy Security API...");

        try {

            let eufyConnection: EufyConnection = new EufyConnection(BASE_SN);
            const eufy = await eufyConnection.initialise();

            const connected = await eufy.connect().then(() => {
                console.log("Connected to Eufy Security API");
                console.log("Alarm is assumed to be disarmed");
            });

            eufy.on("station property changed", (device, name, value: PropertyValue) => {
                if (name === "alarmArmDelay" && value > 0) {
                    console.log("Alarm is being armed");
                    alarmStatus = AlarmStatusValue.ARMED
                    this._controller.setBarColour(LEDBarState.YELLOW);
                }

                if (alarmStatus === AlarmStatusValue.ARMED && name === "alarm" && value === true) {
                    alarmStatus = AlarmStatusValue.TRIGGERED;
                    console.log("Alarm triggered");
                    this._controller.led.state = BlinkingState.BLINKING_FAST;
                    this._controller.closeRelay(true);
                    this._controller.setBarColour(LEDBarState.RED);
                }

                if (name === "guardMode" && value === 6) {
                    alarmStatus = AlarmStatusValue.DISARMED;
                    console.log("Alarm reset");
                    this._controller.led.state = BlinkingState.BLINKING_SLOW;
                    this._controller.closeRelay(false);
                    this._controller.setBarColour(LEDBarState.GREEN);
                }
            });
        } catch (error) {
            console.log("Connection failed");
            console.log(error);
        }
    }
}

const sleep = async (milliseconds: number | undefined) => {
    await new Promise(resolve => {
        return setTimeout(resolve, milliseconds)
    });
};

main();



