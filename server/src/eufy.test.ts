import {expect, test} from '@jest/globals';
import {AlarmEvent, EufySecurity, PushNotificationService, Station} from "eufy-security-client";
import {EufyConnection} from "./main";

var client: EufyConnection;
var eufy: EufySecurity;


beforeAll(async () => {
    client = new EufyConnection("<Base station serial no.>");
    eufy = await client.initialise();

    await eufy.connect();

    console.log("Connected to Eufy Security API");
    console.log("Connection status:" + eufy.isConnected());
    expect(eufy.isConnected()).toBe(true);
});


test('Enumerate devices and stations', async () => {

    await eufy.getDevices().then((devices) => {
        for (const device of devices) {
            console.log("Device: " + device.getSerial() +
                "\nName:" + device.getName() +
                "\nType:" + device.getDeviceType());
            const commands = device.getCommands();
            for (const command of commands) {
                console.log("Command: " + command);
            }
        }
    });

    const stations: Station[] = await eufy.getStations();
    for (const station of stations) {
        console.log("Station: " + station.getSerial() + "\n" +
            "Namne: " + station.getName() + "\n" +
            "Type: " + station.getDeviceType() + "\n" +
            "IP address: " + station.getIPAddress() + "\n");

        var commands = station.getCommands();
        for (const command of commands) {
            console.log("Command: " + command);
        }

        //await station.triggerStationAlarmSound(2);


    }

}, 5000);


test('Get base station', async () => {
    const station: Station = await client.getBase();
    expect(station).toBeDefined();
    expect(station.getSerial()).toBe("<Base statuin serial no.>");
    expect(station.getName()).toBe("Security Base");
    expect(station.getDeviceType()).toBe(0);

    console.log("IP Address: " + station.getIPAddress());

    //expect(station.getIPAddress()).toBe("
});

test("Test alarm event", async () => {

    var station: Station = await client.getBase();
    expect(station).toBeDefined();

    //eufy.on("station alarm event", (station:Station, alarmEvent: AlarmEvent) => {
    //    console.log("Alarm event: " + alarmEvent);
    //});

})

