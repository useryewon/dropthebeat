const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let recorder, audioChunks = [], loops = [];

const clickSound = new Audio('click-sound.mp3'); // 클릭 사운드 파일 경로
document.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
        clickSound.currentTime = 0;
        clickSound.play();
    });
});

const video = document.getElementById('video-element');
video.style.display = 'none'; // 초기 웹캠 스트림 비활성화

let mediaStream;

// 웹캠 비디오와 마이크 오디오 스트림을 가져옴
Promise.all([
    navigator.mediaDevices.getUserMedia({ video: true, audio: false }),
    navigator.mediaDevices.getUserMedia({ audio: true })
]).then(streams => {
    const videoStream = streams[0];
    const audioStream = streams[1];

    mediaStream = new MediaStream([...videoStream.getTracks(), ...audioStream.getTracks()]);
    video.srcObject = videoStream;
}).catch(error => {
    console.error('Error accessing media devices.', error);
});

const webcamCanvas = document.createElement('canvas');
webcamCanvas.width = 1280; // 해상도 증가
webcamCanvas.height = 720;

const mainCanvas = document.createElement('canvas');
mainCanvas.width = 1280; // 해상도 증가
mainCanvas.height = 720;
document.getElementById('visualizers-container').appendChild(mainCanvas);

const webcamCanvasCtx = webcamCanvas.getContext('2d', { willReadFrequently: true });
const mainCanvasCtx = mainCanvas.getContext('2d', { willReadFrequently: true });

const filterStates = {
    origin: false,
    grayscale: false,
    negative: false
};

function applyFilter() {
    webcamCanvasCtx.drawImage(video, 0, 0, webcamCanvas.width, webcamCanvas.height);

    if (filterStates.grayscale) {
        webcamCanvasCtx.filter = 'grayscale(100%)';
    } else if (filterStates.negative) {
        const imageData = webcamCanvasCtx.getImageData(0, 0, webcamCanvas.width, webcamCanvas.height);
        const negativeData = applyNegative(imageData);
        webcamCanvasCtx.putImageData(negativeData, 0, 0);
    } else {
        webcamCanvasCtx.filter = 'none';
    }
}

function applyNegative(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
    }
    return imageData;
}

function toggleWebcamStream(show) {
    video.style.display = show ? 'block' : 'none';
}

document.getElementById('origin').addEventListener('click', () => {
    toggleWebcamStream(true);
    filterStates.origin = true;
    filterStates.grayscale = false;
    filterStates.negative = false;
});

document.getElementById('grayscale').addEventListener('click', () => {
    toggleWebcamStream(true);
    filterStates.origin = false;
    filterStates.grayscale = true;
    filterStates.negative = false;
});

document.getElementById('negative').addEventListener('click', () => {
    toggleWebcamStream(true);
    filterStates.origin = false;
    filterStates.grayscale = false;
    filterStates.negative = true;
});

document.getElementById('off').addEventListener('click', () => {
    toggleWebcamStream(false);
    filterStates.origin = false;
    filterStates.grayscale = false;
    filterStates.negative = false;
});

function draw() {
    requestAnimationFrame(draw);

    mainCanvasCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

    // 웹캠 스트림이 활성화된 경우에만 필터 적용
    if (video.style.display !== 'none') {
        applyFilter();
        mainCanvasCtx.drawImage(webcamCanvas, 0, 0, mainCanvas.width, mainCanvas.height);
    }

    // 비주얼라이저 그리기
    loops.forEach((loop, index) => {
        const analyser = loop.analyser;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        // 가로로 분할된 위치 계산
        const sliceWidth = mainCanvas.width / loops.length;
        const xOffset = index * sliceWidth;

        mainCanvasCtx.lineWidth = 2; // 선 두께 조정
        mainCanvasCtx.strokeStyle = '#000fff';
        mainCanvasCtx.beginPath();

        let x = xOffset;

        for (let i = 0; i < bufferLength; i++) {
            let v = dataArray[i] / 128.0;
            let y = (v * mainCanvas.height) / 2;

            // Y 위치를 캔버스 중앙에서 기준으로 설정
            if (i === 0) {
                mainCanvasCtx.moveTo(x, y); // 중앙 기준으로 이동
            } else {
                mainCanvasCtx.lineTo(x, y); // 중앙 기준으로 이동
            }
            x += sliceWidth / bufferLength; // 분할된 화면에서 x 위치 조정
        }

        // 마지막 점 연결은 생략하여 중복된 선을 제거
        mainCanvasCtx.stroke();
    });

    // 왼쪽 세로 선 그리기 (캔버스 높이와 맞추기)
    mainCanvasCtx.beginPath();
    mainCanvasCtx.moveTo(0, 0);
    mainCanvasCtx.lineTo(0, mainCanvas.height);
    mainCanvasCtx.lineWidth = 2;
    mainCanvasCtx.strokeStyle = '#000fff'; // 선의 색상
    mainCanvasCtx.stroke(); // 선 그리기

    // 비주얼라이저 캔버스를 분할하는 세로선 그리기
    loops.forEach((_, index) => {
        const sliceWidth = mainCanvas.width / loops.length;
        const xOffset = (index + 1) * sliceWidth;

        // 세로선은 마지막 점 연결 없이 그리기
        mainCanvasCtx.beginPath();
        mainCanvasCtx.moveTo(xOffset, 0);
        mainCanvasCtx.lineTo(xOffset, mainCanvas.height); // 세로선 길이를 캔버스 높이에 맞춤
        mainCanvasCtx.lineWidth = 1; // 세로선 두께 조정
        mainCanvasCtx.strokeStyle = '#000fff'; // 세로선 색상
        mainCanvasCtx.stroke(); // 세로선 그리기
    });
}


draw();

document.getElementById('record').addEventListener('click', () => {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    if (!recorder || recorder.state === "inactive") {
        recorder = new MediaRecorder(mediaStream);

        recorder.ondataavailable = (e) => {
            audioChunks.push(e.data);
        };

        recorder.onstop = () => {
            const audioBlob = new Blob(audioChunks);
            const audioURL = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioURL);
            audio.loop = true;

            loops.push({ audio, analyser: audioContext.createAnalyser() });
            audioChunks = [];

            const source = audioContext.createMediaElementSource(audio);
            const analyser = loops[loops.length - 1].analyser;
            source.connect(analyser);
            analyser.connect(audioContext.destination);
            // audio.play(); // 녹음이 종료된 후 자동 재생을 제거하여 play 버튼으로 재생하도록 함
        };

        recorder.start();
    }
});

document.getElementById('stop').addEventListener('click', () => {
    if (recorder && recorder.state === "recording") {
        recorder.stop();
    }
});

document.getElementById('play').addEventListener('click', () => {
    loops.forEach(loop => {
        loop.audio.currentTime = 0;
        loop.audio.play();
    });
});

document.getElementById('deleteLast').addEventListener('click', () => {
    const lastLoop = loops.pop();
    if (lastLoop) {
        lastLoop.audio.pause();
        lastLoop.audio.currentTime = 0;
    }
});

document.getElementById('deleteAll').addEventListener('click', () => {
    loops.forEach(loop => {
        loop.audio.pause();
        loop.audio.currentTime = 0;
    });
    loops = [];
    mainCanvasCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height); // 비주얼라이저 초기화
});

