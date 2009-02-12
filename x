/*
  Ubiquity Command: download-files [regexp pattern] to [folder]
  Author: Duane Johnson
  Email: duane.johnson@gmail.com
  
  Description: Downloads files matching the regular expression pattern to a folder.
  
  Changes:
    2009-02-12
      - Removed duplicate filenames in preview list.
      - Added folder.png icon when optional "to [folder]" is given.
      - Changed command from "save-all" to "download-files".
*/

var noun_type_file_pattern = {
  _name: "file pattern",
  suggest: function( text, html ) {
    var suggestions  = [CmdUtils.makeSugg(text)];
    var exts = SaveAll.uniqueExtensions();
    for (i in exts) {
      if (exts[i].match(text)) {
        suggestions.push(CmdUtils.makeSugg(exts[i] + "$"));
      }
    }
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
    if (!pattern) pattern = "";
    var doc = Application.activeWindow.activeTab.document;
    var files = [];
    files = files.concat(jQuery("a,link", doc.body).map(function() { return this.getAttribute("href"); }).get());
    files = files.concat(jQuery("img,script,iframe", doc.body).map(function() { return this.getAttribute("src"); }).get());
    var matchedSet = {};
    try {
      for (i in files) {
        var file = files[i];
        if (file.match(pattern)) {
          matchedSet[file] = true;
        }
      }
    } catch(e) {
      
    }
    var matchedList = [];
    for (file in matchedSet) {
      matchedList.push(file);
    }
    return matchedList;
  },
    
  uniqueExtensions: function() {
    var files = SaveAll.matchFiles();
    // Use an object's keys to maintain a unique list
    var extSet = {};
    for (i in files) {
      if (files[i]) {
        var ext = SaveAll.extFromURL(files[i]);
        if (ext) extSet[ext] = true;
      }
    }
    // Turn the object into an array
    var exts = [];
    for (j in extSet) exts.push(j);
    return exts;
  },
  
  extFromURL: function(url) {
    url = url.replace(/^https?:\/\//, "");
    url = url.replace(/\?.*$/, "");
    var m = url.match(/\/.*\.([^\.]*)$/);
    if (m) return m[1];
    else   return false;
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

CmdUtils.CreateCommand({
  name: "download-files",
  icon: "http://inquirylabs.com/downloads/download.png",
  homepage: "http://inquirylabs.com/",
  author: { name: "Duane Johnson", email: "duane.johnson@gmail.com"},
  license: "MIT",
  description: "Downloads all files of the given pattern to your computer.",
  help: "e.g. save-all *.png ~/Desktop/Images",
  takes: {"pattern": noun_type_file_pattern},
  modifiers: {"to": noun_arb_text},
  preview: function( pblock, pattern, mods ) {
    if (pattern.text) {
      var template = "<p>Download files matching /${pattern}/${dest}</p><ul>${list}</ul>";
      var matchList = "";
      fileUrls = SaveAll.matchFiles(pattern.text);
      for (i in fileUrls) {
        matchList += "<li>" + fileUrls[i] + "</li>";
      }
      var folderHtml = "<p><img src='http://inquirylabs.com/downloads/folder.png' align='absmiddle' /> " + mods["to"].html + "</p>";
      pblock.innerHTML = CmdUtils.renderTemplate(template,
        {
          "pattern": pattern.html,
          "dest": mods["to"].text ? folderHtml : "",
          "list": matchList
        });
    } else {
      pblock.innerHTML = "<p>Downloads all files matching the given pattern.</p>";
    }
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