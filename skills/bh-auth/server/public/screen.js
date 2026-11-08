// Bewusst schlichtes JavaScript: Der Browser des Beamers ist nicht der neueste.
(function () {
  var title = document.getElementById('t');
  var text = document.getElementById('s');
  function refresh() {
    var x = new XMLHttpRequest();
    x.open('GET', location.pathname + '/content');
    x.onload = function () {
      if (x.status !== 200) return;
      var c = JSON.parse(x.responseText);
      title.textContent = c.title;
      text.textContent = c.text;
    };
    x.send();
  }
  setInterval(refresh, 5000);
})();
