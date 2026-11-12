
const engineeringButton = document.querySelector(
    '[data-module="engineering"]'
);

const bankingButton = document.querySelector(
    '[data-module="banking"]'
);

engineeringButton.addEventListener("click", function () {
    alert("Welcome to ReliGuard AI 1.0 - Engineering!");
});

bankingButton.addEventListener("click", function () {
    alert("Welcome to ReliGuard AI 2.0 - Banking!");
});

console.log("ReliGuard AI is ready!");
