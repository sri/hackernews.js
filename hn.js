// alias hn="cat ~/Desktop/hn.js | sed '/^\/\//d' | tr '\n' ' ' | pbcopy"
// todo: collapse comments
javascript:(function() {
  var gParent = null;
  var gReplies = 0;
  var gTree = null;
  var gComments = null;
  var gOldComments = [];
  var COMMENT_RE = /(\d+) points? by ([^\s]+) (\d+) (\w+) ago/;
  function Comment() {
    this.points = 0;
    this.user = "";
    this.secs = 0;
    this.elt = null;
    this.ancestor = null; /* a child of gParent */
    this.children = [];
    this.level = 0;
    this.txt = "";
    this.deleted = false;
    this.as_array = function(a) {
      if (!a) a = [];
      a.push(this);
      for (var i=0; i<this.children.length; i++)
        this.children[i].as_array(a);
      return a;
    };
    this.latest = function() {
      var min = this.secs;
      for (var i=0; i<this.children.length; i++)
        min = Math.min(min, this.children[i].latest());
      return min;
    };
  }
  function findParent(all, level) {
    if (level <= 0)
      return null;
    for (var i=all.length-1; i>=0; i--) {
      var com = all[i];
      if (com.level < level)
        return com;
    }
    return null;
  }
  function markReply(e) {
    e.style.borderTop = '1px solid #ff6600';
  }
  function markNew(e) {
    e.style.borderTop = '1px solid #0000ee';
  }
  function unmarkOld(e) {
    e.style.borderTop = 0;
  }
  function gui() {
    var div = document.createElement("div");
    var sep = function() { div.appendChild(document.createTextNode("\u00A0\u00A0")); };
    div.style.position = "fixed";
    div.style.bottom = 0;
    div.style.right = 0;
    div.style.padding = "5px";
    div.style.backgroundColor = "#ff6600";
    div.style.fontSize = "82%";
    var reloadElt = document.createElement("a");
    reloadElt.setAttribute("href", "javascript:document.hn_reload()");
    reloadElt.innerHTML = "reload";
    div.appendChild(reloadElt);
    sep();
    var byParent = document.createElement("a");
    byParent.setAttribute("href", "javascript:document.hn_byNewest('parent')");
    byParent.setAttribute("title", "Sort by thread parent");
    byParent.innerHTML = "byParent";
    div.appendChild(byParent);
    sep();
    var byReply = document.createElement("a");
    byReply.setAttribute("href", "javascript:document.hn_byNewest('reply')");
    byReply.innerHTML = "byReply";
    byReply.setAttribute("title", "Sort by latest reply in thread");
    div.appendChild(byReply);
    sep();
    var rSpan = document.createElement("span");
    rSpan.style.color = (gReplies==0) ? 'black' : 'white';
    rSpan.innerHTML = gReplies + ((gReplies==1) ? " reply" : " replies");
    div.appendChild(rSpan);
    document.body.appendChild(div);
  }
  function me() {
    var span = document.getElementsByTagName("span");
    for (var i=0; i<span.length; i++) {
      var attrs = span[i].attributes;
      if (attrs.length == 1 && 
          attrs[0].name == "class" && 
          attrs[0].value == "pagetop") {
        var a = span[i].getElementsByTagName("a");
        if (a.length != 2)
          continue;
        if (a[1].innerHTML == "logout")
          return a[0].innerHTML;
      }
    }
    return null;
  }
  function byNewest(x) {
    for (var i=0; i<gParent.childNodes.length; i++)
      gParent.removeChild(gParent.childNodes[i]);
    var cmp = function(x, y) {
      if (x < y) return -1;
      else if (x > y) return 1;
      else return 0;
    };
    var newestParent = function(x, y) {
      return cmp(x.secs, y.secs);
    };
    var newestReply = function(x, y) {
      return cmp(x.latest(), y.latest());
    };
    var fn = (x=='parent') ? newestParent : newestReply;
    gTree.sort(fn);
    for (var i=0; i<gTree.length; i++) {
      var a = gTree[i].as_array();
      for (var j=0; j<a.length; j++)
        gParent.appendChild(a[j].ancestor);
    }
  }
  function articleInfo(x) {
    try {
      if (!x) x = document.body.textContent;
      var points = /(\d+)\s*points?/.exec(x);
      var timespec = /(\d+)\s*(day|hour|minute)s?\s*ago/.exec(x);
      var ncomments = /(\d+)\s*comments?/.exec(x);
      return [points[0], timespec[0], ncomments[0], ncomments[1]];
    } catch(err) {
    }
    return null;
  }
  function updateArticleInfo(old, cur) {
    try {
      var points = cur[0];
      var timespec = cur[1];
      var comments = cur[2];
      var n = parseInt(cur[3]) - parseInt(old[3]);
      var td = document.getElementsByTagName("td");
      for (var i=0; i<td.length; i++) {
        var e = td[i];
        if (e.attributes.length == 1 &&
            e.attributes[0].name == "class" &&
            e.attributes[0].value == "subtext") {
          var html = e.innerHTML;
          html = html.replace(/(\d+)\s*points?/, points);
          html = html.replace(/\(\d+ new\)/, "");
          html = html.replace(/(\d+)\s*comments?/, comments + " (" + n + " new)");
          html = html.replace(/(\d+)\s*(day|hour|minute)s?\s*ago/, timespec);
          e.innerHTML = html;
          break;
        }
      }
    } catch(err) {
    }
  }
  function reload() {
    document.hn_isReload = true;
    var old = articleInfo();
    var top = gParent.parentNode;
    top.removeChild(gParent);
    var xh = window.XMLHttpRequest ? 
        new window.XMLHttpRequest() :
        new ActiveXObject('Microsoft.XMLHTTP');
    xh.onreadystatechange = function() {
      if (xh.readyState == 4) {
        if (xh.status == 200) {
          try {
            var html = xh.responseText;
            html = html.replace(/[\s\S]*<body>/, "");
            html = html.replace(
              /<img src="http:\/\/ycombinator.com\/images\/s.gif" height=10 width=0>[\s\S]*/,
              "");
            html = html.replace(/[\s\S]*<\/form>/, "");
            html = html.replace("</td>", "");
            html = html.replace("</tr>", "");
            html = html.replace("</table>", "");
            html = html.replace("<br>", "");
            html = html.replace("<br>", "");
            html = html.replace(/<br><br>\n<\/td><\/tr><tr><td>\s*$/, "");
            top.innerHTML = html;
            gParent = null;
            parse();
            updateArticleInfo(old, articleInfo(xh.responseText));
          } catch(err) {
            alert("oops!\nsomething went wrong after fetching the new page");
          }
        } else {
          alert("reload error, status " + xh.status + ":\n" + xh.responseText);
        }
      }
    };
    xh.open("GET", document.location.href, true);
    xh.send(null);
  }
  function parse() {
    gReplies = 0;
    var isMe = me();
    var comments = [];
    var tree = [];
    var tr = document.getElementsByTagName("tr");
    for (var i=0; i<tr.length; i++) {
      var e = tr[i];
      var c = e.getElementsByTagName('td');
      if (c.length != 3)
        continue;
      var c0 = c[0];
      var c1 = c[1];
      var c2 = c[2]; 
      if (c1.attributes.length != 1 ||
          c1.attributes[0].name != "valign" ||
          c1.attributes[0].value != "top")
        continue;
      if (c2.attributes.length != 1 ||
          c2.attributes[0].name != "class" ||
          c2.attributes[0].value != "default")
        continue;
      var m = COMMENT_RE.exec(c2.textContent);
      if (!m) {
        /* no match means deleted comment */
        m = [null, '0', '', '0', ''];
      }      
      if (!gParent) {
        gParent = e.parentNode.parentNode.parentNode.parentNode.parentNode;
      }
      var com = new Comment();
      com.elt = e;
      com.ancestor = e.parentNode.parentNode.parentNode.parentNode;
      com.level = c0.getElementsByTagName('img')[0].width/40;
      com.points = parseInt(m[1]);
      com.user = m[2];
      if (m[0])
        com.txt = com.user + " " + e.textContent.replace(m[0], "");
      if (document.hn_isReload && !gOldComments[com.txt])
        markNew(c2);
      else
        unmarkOld(c2);
      gOldComments[com.txt] = true;
      com.secs = parseInt(m[3]);
      if (/minute/.test(m[4])) com.secs *= 60;
      else if (/hour/.test(m[4])) com.secs *= 3600;
      else if (/day/.test(m[4])) com.secs *= 86400;
      var parent = findParent(comments, com.level);
      if (parent) {
        if (parent.user == isMe && com.user != isMe) {
          gReplies++;
          markReply(c2);
        }
        parent.children.push(com);
      } else {
        tree.push(com);
      }
      comments.push(com);
    }
    gComments = comments;
    gTree = tree;
  }
  function main() {
    try {
      document.hn_byNewest = byNewest;
      document.hn_reload = reload;
      parse();
      gui();
    } catch (err) {
      alert("oops!\n" + err);
    } 
  }
  main();
})();
