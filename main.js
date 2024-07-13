const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

let scrcpyProcess = null;
let recordingProcess = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Function to create a .bat file for scrcpy with the desired resolution and device selection
const createBatFile = (deviceSerial, resolution) => {
  const scrcpyPath = path.join(__dirname, 'my-electron-app', 'scrcpy', 'scrcpy.exe');
  const batContent = `"${scrcpyPath}" -s ${deviceSerial} --max-size ${resolution}\n`;
  const batPath = path.join(__dirname, 'scrcpy_resolution.bat');

  fs.writeFileSync(batPath, batContent, 'utf8');
  return batPath;
};

// Function to create a .bat file for scrcpy with screen recording
const createRecordingBatFile = (deviceSerial) => {
  const scrcpyPath = path.join(__dirname, 'my-electron-app', 'scrcpy', 'scrcpy.exe');
  const recordingsDir = path.join(__dirname, 'recordings'); // Directory to save recordings
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir);
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const recordingPath = path.join(recordingsDir, `recording-${timestamp}.mp4`);
  const batContent = `"${scrcpyPath}" -s ${deviceSerial} --record "${recordingPath}"\n`;
  const batPath = path.join(__dirname, 'scrcpy_recording.bat');

  fs.writeFileSync(batPath, batContent, 'utf8');
  return batPath;
};

// Function to start scrcpy with a specific resolution and device selection
const startScrcpy = (deviceSerial, resolution) => {
  if (scrcpyProcess) {
    console.log('A scrcpy process is already running. Stopping the current process before starting a new one.');
    scrcpyProcess.kill();
  }

  const batFilePath = createBatFile(deviceSerial, resolution);

  scrcpyProcess = exec(`cmd /c ${batFilePath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
  });

  scrcpyProcess.on('close', (code) => {
    console.log(`scrcpy process exited with code ${code}`);
    scrcpyProcess = null;
  });
};

// Function to start scrcpy with screen recording
const startRecording = (deviceSerial) => {
  if (recordingProcess) {
    console.log('A recording process is already running. Stopping the current process before starting a new one.');
    recordingProcess.kill();
  }

  const batFilePath = createRecordingBatFile(deviceSerial);

  recordingProcess = exec(`cmd /c ${batFilePath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
  });

  recordingProcess.on('close', (code) => {
    console.log(`Recording process exited with code ${code}`);
    recordingProcess = null;
  });
};

// Function to stop scrcpy or recording
const stopProcesses = () => {
  if (scrcpyProcess) {
    scrcpyProcess.kill();
    scrcpyProcess = null;
    console.log('Scrcpy process stopped.');
  } else if (recordingProcess) {
    recordingProcess.kill();
    recordingProcess = null;
    console.log('Recording process stopped.');
  } else {
    console.log('No processes to stop.');
  }
};

// Function to connect to a device over Wi-Fi
const connectWifi = (ipAddress) => {
  console.log(`Attempting to connect to device at IP: ${ipAddress}`);
  exec(`adb connect ${ipAddress}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
  });
};

// Function to get the list of connected devices
const getDevices = () => {
  return new Promise((resolve, reject) => {
    exec('adb devices', (error, stdout, stderr) => {
      if (error) {
        reject(`exec error: ${error}`);
        return;
      }

      const devices = stdout
        .split('\n')
        .slice(1)
        .filter(line => line.trim() !== '')
        .map(line => line.split('\t')[0]);

      resolve(devices);
    });
  });
};

// IPC handler to start scrcpy with resolution options and device selection
ipcMain.handle('start-scrcpy', async (event, deviceType, quality) => {
  try {
    const devices = await getDevices();
    const deviceSerial = devices[0]; // Select the first device for simplicity. Adjust as needed.

    if (!deviceSerial) {
      throw new Error('No ADB devices found.');
    }

    let resolution;
    switch (quality) {
      case '480p':
        resolution = '800';
        break;
      case '720p':
        resolution = '1280';
        break;
      case '1080p':
        resolution = '1920';
        break;
      default:
        throw new Error('Unsupported quality:', quality);
    }
    startScrcpy(deviceSerial, resolution);
  } catch (error) {
    console.error(error.message);
  }
});

// IPC handler to connect to a device over Wi-Fi
ipcMain.handle('connect-wifi', (event, ipAddress) => {
  console.log('IPC event received: connect-wifi', ipAddress);
  connectWifi(ipAddress);
});

// IPC handler to start recording
ipcMain.handle('start-recording', async () => {
  try {
    const devices = await getDevices();
    const deviceSerial = devices[0]; // Select the first device for simplicity. Adjust as needed.

    if (!deviceSerial) {
      throw new Error('No ADB devices found.');
    }

    startRecording(deviceSerial);
  } catch (error) {
    console.error(error.message);
  }
});

// IPC handler to stop scrcpy or recording
ipcMain.handle('stop-scrcpy', () => {
  stopProcesses();
});

// Function to make a call using ADB
const makeCall = (phoneNumber) => {
  exec(`adb shell am start -a android.intent.action.CALL -d tel:${phoneNumber}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
  });
};

// Function to play music on the connected Android device
const playMusic = (songUrl) => {
  exec(`adb shell am start -a android.intent.action.VIEW -d "${songUrl}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
  });
};

// Function to start navigation on the connected Android device
const startNavigation = (destination) => {
  exec(`adb shell am start -a android.intent.action.VIEW -d "google.navigation:q=${encodeURIComponent(destination)}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
  });
};

// IPC handler to make a call
ipcMain.handle('make-call', (event, phoneNumber) => {
  makeCall(phoneNumber);
});

// IPC handler to play music
ipcMain.handle('play-music', (event, songUrl) => {
  playMusic(songUrl);
});

// IPC handler to start navigation
ipcMain.handle('start-navigation', (event, destination) => {
  startNavigation(destination);
});

// Function to get the device IP address
const getIpAddress = () => {
  return new Promise((resolve, reject) => {
    exec('adb shell ip addr show wlan0', (error, stdout, stderr) => {
      if (error) {
        reject(`exec error: ${error}`);
        return;
      }
      const match = stdout.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
      if (match) {
        resolve(match[1]);
      } else {
        reject('No IP address found');
      }
    });
  });
};

// IPC handler to get the device IP address
ipcMain.handle('get-ip-address', async (event) => {
  try {
    const ipAddress = await getIpAddress();
    return ipAddress;
  } catch (error) {
    console.error(error);
    return null;
  }
});
