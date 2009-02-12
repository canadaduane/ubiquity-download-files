var noun_type_file_pattern = {
  _name: "file pattern",
  suggest: function( text, html ) {
    var suggestions  = [CmdUtils.makeSugg(text), CmdUtils.makeSugg("*.png")];
    return suggestions;
  }
}

var SaveAll = {
  getFolder: function(preferred) {
    var path = preferred;
    var folder;
    if (!path) {
      var nsIFilePicker = Components.interfaces.nsIFilePicker;
      var picker = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
      picker.init(window, "", nsIFilePicker.modeGetFolder);
      if (picker.show() == nsIFilePicker.returnOK) {
        path = picker.file.path;
      } else {
        displayMessage("Cancelled");
        return false;
      }
    }
    try {
      var err = function(msg) { displayMessage(msg + "('" + path + "')"); };
      var folder = Components.
        classes["@mozilla.org/file/local;1"].
        createInstance(Components.interfaces.nsILocalFile);
        folder.initWithPath(path);
      if (!folder.isDirectory()) {
        err("The destination is not a folder");
        return false;
      }
      return folder;
    } catch(e) {
      err("The destination folder does not exist");
      return false;
    }
  },
  
  matchFiles: function(pattern) {
    var doc = Application.activeWindow.activeTab.document;
    var files = [];
    files = files.concat(jQuery("a", doc.body).map(function() { return this.getAttribute("href"); }).get());
    files = files.concat(jQuery("img,script,iframe", doc.body).map(function() { return this.getAttribute("src"); }).get());
    var matched = [];
    try {
      for (i in files) {
        var file = files[i];
        if (file.match(pattern)) {
          matched.push(file);
        }
      }
    } catch(e) {
      
    }
    return matched;
  },
  
  fileFromURL: function(url) {
    var m = url.match(/\/([^\/]*)$/);
    if (m) return m[1];
    else   return url;
  },
  
  saveFile: function(file_url, folder) {
    try {
      var doc = Application.activeWindow.activeTab.document;
      var current = Utils.url(doc.documentURI);
      var uri = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService).newURI(file_url, null, current);

      // New file object & new file if necessary
      var target_file = folder.clone();
      target_file.append(SaveAll.fileFromURL(file_url));
      if(!target_file.exists()) { target_file.create(0x00, 0644); }
      
      //new persitence object
      var persist = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(Components.interfaces.nsIWebBrowserPersist);

      //save file to target
      persist.saveURI(uri, null, null, null, null, target_file);
      return true;
    } catch (e) {
      // alert(e);
    }
    return false;
  }
}


/* This is a template command */
CmdUtils.CreateCommand({
  name: "save-all",
  icon: "http://inquirylabs.com/downloads/download.png",
  homepage: "http://inquirylabs.com/",
  author: { name: "Duane Johnson", email: "duane.johnson@gmail.com"},
  license: "MIT",
  description: "Downloads all files of the given pattern to your desktop or other location.",
  help: "e.g. save-all *.png ~/Desktop/Images",
  takes: {"pattern": noun_type_file_pattern},
  modifiers: {"to": noun_arb_text},
  preview: function( pblock, pattern, mods ) {
    var template = "<h1>Download ${pattern}</h1><ul>${list}</ul>";
    var matchList = "";
    fileUrls = SaveAll.matchFiles(pattern.text);
    for (i in fileUrls) {
      matchList += "<li>" + fileUrls[i] + "</li>";
    }
    pblock.innerHTML = CmdUtils.renderTemplate(template,
      {
        "pattern": pattern.html,
        "list": matchList
      });
  },
  execute: function(pattern, mods) {
    var folder = SaveAll.getFolder(mods["to"].text);
    if (folder) {
      // displayMessage("Downloading to " + folder.path);
      fileUrls = SaveAll.matchFiles(pattern.text);
      // CmdUtils.log("Matched files: ", fileUrls);
      var succeeded = 0;
      for (i in fileUrls) {
        if (SaveAll.saveFile(fileUrls[i], folder)) succeeded += 1;
      }
      if (succeeded > 0) {
        if (succeeded == fileUrls.length)
          displayMessage("All " + succeeded + " files were saved to " + folder.path);
        else
          displayMessage("Only " + succeeded + " (of " + fileUrls.length + ") files were saved to " + folder.path);
      } else {
        displayMessage("No files were saved.");
      }
    }
  }
});