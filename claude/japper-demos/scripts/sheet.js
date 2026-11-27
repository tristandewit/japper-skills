// node sheet.js <video.mp4> <out.png>
// A contact sheet of a take, one frame every 2.5 seconds on a grid, to look
// at instead of watching it.
const { execFileSync } = require("child_process");

const [video, out] = process.argv.slice(2);
const [width, height] = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", video,
]).toString().trim().split(",").map(Number);
const [tile, scale] = width < height ? ["10x2", 180] : ["4x4", 400];
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", video, "-vf", `fps=1/2.5,scale=${scale}:-1,tile=${tile}`, "-frames:v", "1", out]);
console.log(out);
