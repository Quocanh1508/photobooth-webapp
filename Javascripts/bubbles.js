// connect to bubble container
const bubbleContainer = document.querySelector(".bubble-container");

// get images
const bubbleImages = [
  "../Assets/fish-photobooth/camerapage/bubbles/bubble4.png",
  "../Assets/fish-photobooth/camerapage/bubbles/bubble1.png",
  "../Assets/fish-photobooth/camerapage/bubbles/bubble2.png",
  "../Assets/fish-photobooth/camerapage/bubbles/bubble3.png",
  "../Assets/fish-photobooth/camerapage/bubbles/bubble5.png"
];

const sakuraImage = "../Assets/japanese-theme/sakura-petal.png";

// create bubble or petal
const createBubble = () => {
  const currentTheme = localStorage.getItem('photobooth_theme') || 'underwater';
  const isJapanese = currentTheme === 'japanese';

  const element = document.createElement("img");

  if (isJapanese) {
    element.src = sakuraImage;
    element.classList.add("sakura-petal");
  } else {
    element.src = bubbleImages[Math.floor(Math.random() * bubbleImages.length)];
    element.classList.add("bubble");
  }

  // random position, size, duration
  element.style.left = Math.random() * 100 + "vw";
  const size = isJapanese ? (15 + Math.random() * 15) : (20 + Math.random() * 20);
  element.style.width = size + "px";
  const duration = isJapanese ? (7 + Math.random() * 5) : (12 + Math.random() * 8);
  element.style.animationDuration = duration + "s";

  // random final opacity
  element.addEventListener("animationend", () => element.style.opacity = 0.2 + Math.random() * 0.8);

  bubbleContainer.appendChild(element);

  // remove after animation
  setTimeout(() => element.remove(), duration * 1000);
};

// generate bubbles continuously
setInterval(createBubble, 400);
