// What the recorder needs from the machine: Maestro with a Java it can run,
// and the simulator or Android device to film.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

// Maestro needs Java, which a Mac often has without it being on the PATH.
function env() {
    const works = (java) => spawnSync(java, ["-version"], { stdio: "ignore" }).status === 0;
    const extra = [path.join(os.homedir(), ".maestro", "bin")];
    if (!works("java")) {
        const homes = [
            process.env.JAVA_HOME,
            "/opt/homebrew/opt/openjdk",
            "/usr/local/opt/openjdk",
            "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
            path.join(os.homedir(), "Applications/Android Studio.app/Contents/jbr/Contents/Home"),
        ].filter(Boolean);
        const home = homes.find((h) => works(path.join(h, "bin", "java")));
        if (!home) {
            throw new Error("No Java found. Maestro needs Java 17 or newer: brew install openjdk");
        }
        extra.push(path.join(home, "bin"));
        return { ...process.env, JAVA_HOME: home, PATH: [...extra, process.env.PATH].join(path.delimiter) };
    }
    return { ...process.env, PATH: [...extra, process.env.PATH].join(path.delimiter) };
}

function adb() {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), "Library/Android/sdk");
    const inSdk = path.join(sdk, "platform-tools", "adb");
    return fs.existsSync(inSdk) ? inSdk : "adb";
}

// The device to film: the one named, or the only one running.
function device(platform, named) {
    if (platform === "ios") {
        const booted = Object.values(JSON.parse(execFileSync("xcrun", ["simctl", "list", "devices", "booted", "-j"])).devices).flat();
        const found = named ? booted.find((d) => d.udid === named || d.name === named) : booted[0];
        if (!found) {
            throw new Error(named ? `Simulator ${named} is not booted` : "No simulator is booted: xcrun simctl boot \"<name>\" && open -a Simulator");
        }
        if (!named && booted.length > 1) {
            throw new Error(`Several simulators are booted, name one with --device: ${booted.map((d) => `${d.name} (${d.udid})`).join(", ")}`);
        }
        return found.udid;
    }
    if (platform === "android") {
        const serials = execFileSync(adb(), ["devices"]).toString().split("\n").slice(1)
            .map((line) => line.trim().split(/\s+/)).filter(([, state]) => state === "device").map(([serial]) => serial);
        if (named ? !serials.includes(named) : serials.length === 0) {
            throw new Error(named ? `Android device ${named} is not connected` : "No Android emulator or device is running");
        }
        if (!named && serials.length > 1) {
            throw new Error(`Several Android devices are connected, name one with --device: ${serials.join(", ")}`);
        }
        return named || serials[0];
    }
    throw new Error("The platform is ios or android");
}

module.exports = { env, adb, device };
