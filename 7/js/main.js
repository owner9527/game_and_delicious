/* ============================================================
   启动入口
   ============================================================ */
(function () {
  "use strict";
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => MMUI.boot());
  } else {
    MMUI.boot();
  }
})();
