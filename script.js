
document.addEventListener("DOMContentLoaded", function () {
    const engineeringButton = document.querySelector(
        '[data-module="engineering"]'
    );

    if (engineeringButton) {
        engineeringButton.addEventListener("click", function () {
            window.location.href = "engineering/index.html";
        });
    }

    console.log("ReliGuard AI Engineering is ready!");
});
