/*
  Ubiquity Command: download-files [regexp pattern] to [folder]
  Author: Duane Johnson
  Email: duane.johnson@gmail.com
  
  Description: Downloads files matching the regular expression pattern to a folder.
*/

var use_file_extension = false;
var poorly_formed_regexp = false;

// Suggests file extensions from the current page, e.g. "png$" if there is a png image,
// or "js$" if there are javascript files.
var noun_type_file_extension_from_page = {
  _name: "file pattern",
  suggest: function( text, html ) {
    var suggestions  = [CmdUtils.makeSugg(text)];
    
    if (!use_file_extension) {
      var exts = DownloadFiles.uniqueExtensions();
      for (i in exts) {
        if (exts[i].indexOf(text) >= 0) {
          suggestions.push(CmdUtils.makeSugg(exts[i] + "$"));
        }
      }
    }
    
    return suggestions;
  }
}

// Suggests autocompletion for directories on the local filesystem.  For example, if
// you type ~/Li<tab> on a Mac, then it will find the "Library" subdirectory in your
// home directory and (supposing your username is 'duane'), it will complete the noun
// as "/Users/duane/Library".
var noun_type_local_directory = {
  _name: "directory on local system",
  suggest: function( text, html ) {
    var suggestions = [];
    
    // The tilde is an illegal directory name by itself, but it is legal with a
    // trailing slash
    if (text == "~") text = "~/";
    
    // Always accept whatever the user types, even if it's an invalid directory
    suggestions.push(CmdUtils.makeSugg(text));

    // Break the directory up into everything before and including the slash, and
    // everything after the last slash
    var parts = text.match(/^(.*\/)([^\/]*)$/);
    if (parts) {
      // The first part is the path
      var path = parts[1];
      // Everything after the last slash becomes a "possible" completion, depending on
      // subdirectory names
      var possible = parts[2];
      
      try {
        var folder = Components.
          classes["@mozilla.org/file/local;1"].
          createInstance(Components.interfaces.nsILocalFile);
        folder.initWithPath(path);
        
        if (folder.isDirectory()) {
          var enum = folder.directoryEntries;
          while (enum.hasMoreElements()) {
            var dirEntry = enum.getNext().QueryInterface(Components.interfaces.nsIFile);
            // Need exists() here so we can ignore symlinks to files that no longer exist
            if (dirEntry.exists() && dirEntry.isDirectory()) {
              // Does this sub-directory match the 'possible' substring?
              // To test, get the part of the path after the last '/' and compare with 'possible'
              var match = dirEntry.path.match(/\/([^\/]*)$/);
              // CmdUtils.log(possible, match);
              if (match && match[1].indexOf(possible) == 0) {
                if (dirEntry.path != text) // Don't suggest twice the same thing they've explicitly typed
                  suggestions.push(CmdUtils.makeSugg(dirEntry.path));
              }
            }
          }
        }
      } catch(e) {
        // CmdUtils.log(e);
      }
    }
    
    return suggestions;
  }
}

var DownloadFiles = {
  // Given a javascript object with keys and values, return just the keys. In other words, use the
  // keys as a "set" so we don't have to do it ourselves.
  listFromSet: function(obj) {
    var newList = [];
    for (k in obj) newList.push(k);
    return newList;
  },
  
  // Returns true if a folder exists on the local file system, false otherwise
  folderExists: function(path) {
    try {
      var folder = Components.
        classes["@mozilla.org/file/local;1"].
        createInstance(Components.interfaces.nsILocalFile);
      folder.initWithPath(path);
      if (!folder.isDirectory()) {
        return false;
      }
      return true;
    } catch(e) {
      return false;
    }
  },
  
  // Pass in a "preferred" folder.  If null or undefined, getFolder will let the user pick a folder.
  // Returns false on failure (e.g. the user cancelled), or the nsIFile object on success.
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
  
  // Looks for 'pattern' within the current page's HTML and any frames or iframes.
  //   - Searches 'a' tags and 'link' tags for 'href' attributes;
  //   - Searches 'img' and 'script' tags for 'src' attributes.
  // Returns: A list of URLs matching the pattern.
  matchFiles: function(pattern) {
    if (!pattern) pattern = "";
    var doc = Application.activeWindow.activeTab.document;
    var files = [];
    var i, j;

    var addFiles = function(doc) {
      files = files.concat(jQuery("a,link", doc.body).map(function() { return this.getAttribute("href"); }).get());
      files = files.concat(jQuery("img,script", doc.body).map(function() { return this.getAttribute("src"); }).get());
      
      // Search contents within frames, if any
      jQuery("frame,iframe", doc.body).each(function() {
        addFiles(this.contentDocument);
      });
      
      var IOService =
        Components.classes["@mozilla.org/network/io-service;1"].
        getService(Components.interfaces.nsIIOService);
      // Search style sheets
      for (i = 0; i < doc.styleSheets.length; i++) {
        var sheet = doc.styleSheets[i];
        var cssURI = IOService.newURI(sheet.href, null, null);
        // Loop through each rule in each stylesheet
        for (j = 0; j < sheet.cssRules.length; j++) {
          var style = sheet.cssRules[j].cssText;

          // Capture the url() portion of the rule
          var match = style.match(/url\(([^\)]+)\)/);
          if (match) {
            var relativePath = match[1];
            // Make sure the URI is relative to the CSS from which it was extracted
            var imageURI = IOService.newURI(relativePath, null, cssURI);
            files.push(imageURI.spec);
          }
        }
        
      }
    };
    
    // Recursively add files from the main document
    addFiles(doc);
    
    // Only add files that match our 'pattern' criterion, adding matches to a Set so
    // we get just one of each result (no duplicates).
    var matchedSet = {};
    for (i in files) {
      var file = files[i];
      if (file.match(pattern)) {
        matchedSet[file] = true;
      }
    }
    return DownloadFiles.listFromSet(matchedSet);
  },
  
  // Finds unique file extensions from the list of all URLs produced from matchFiles().
  // Returns the list, e.g. ["gif", "js"]
  uniqueExtensions: function() {
    var files = DownloadFiles.matchFiles();
    // Use an object's keys to maintain a unique list
    var extSet = {};
    for (i in files) {
      if (files[i]) {
        var ext = DownloadFiles.extFromURL(files[i]);
        if (ext) extSet[ext] = true;
      }
    }
    return DownloadFiles.listFromSet(extSet);
  },
  
  // Given a url string, returns a file extension if possible (e.g. "gif" or "jpg")
  extFromURL: function(url) {
    url = url.replace(/^https?:\/\//, "");
    url = url.replace(/\?.*$/, "");
    var m = url.match(/\/.*\.([^\.]*)$/);
    if (m) return m[1];
    else   return false;
  },
  
  // Given a url string, returns the "leaf" part of the path,
  //   e.g. "http://mysite.com/files/blah.jpg" becomes "blah.jpg"
  fileFromURL: function(url) {
    var m = url.match(/\/([^\/]*)$/);
    if (m) return m[1];
    else   return url;
  },
  
  // Given a url string and an nsIFile 'folder' object that points to a local
  // directory, download the thing to the folder.
  downloadFile: function(file_url, folder) {
    try {
      var doc = Application.activeWindow.activeTab.document;
      var current = Utils.url(doc.documentURI);
      var uri = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService).newURI(file_url, null, current);

      // New file object & new file if necessary
      var target_file = folder.clone();
      target_file.append(DownloadFiles.fileFromURL(file_url));
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
  help: "e.g. download-files png$ ~/Desktop/Images",
  takes: {"pattern": noun_type_file_extension_from_page},
  modifiers: {"to": noun_type_local_directory},
  preview: function( pblock, pattern, mods ) {
    if (!pattern.text) {
      pblock.innerHTML = "<p>Downloads all files matching the given pattern.</p>";
      return;
    }
    
    var template = "<p>Download files matching /${pattern}/${dest}</p><ul>${list}</ul>";
    var path = mods["to"].text;
    var folderHtml = "";
    var matchList = "";
    
    if (path) {
      // Take care of the folder icon.  It should be "x"ed out if the destination does not exist
      folderHtml =
        "<p><img src='http://inquirylabs.com/downloads/folder" +
        (DownloadFiles.folderExists(path) ? "" : "-x") + ".png'" +
        " align='absmiddle' /> " + mods["to"].html + "</p>";
      // Hackish way of telling our noun_type_file_extension_from_page to
      // stop suggesting things once a folder is specified
      use_file_extension = true;
    } else {
      use_file_extension = false;
    }
    
    try {
      fileUrls = DownloadFiles.matchFiles(pattern.text);
    } catch(e) {
      fileUrls = false;
    }
    
    if (fileUrls === false) {
      template = "<p>Download files matching [Incorrectly Formatted Regular Expression]</p>";
    } else if (fileUrls.length == 0) {
      template = "<p>No files match the regular expression /${pattern}/</p>";
    } else if (fileUrls.length > 0) {
      for (i in fileUrls) {
        var url = fileUrls[i];
        var filename = DownloadFiles.fileFromURL(url);
        var span = "&nbsp;&nbsp;<span style='color:#888'>" + unescape( url ) + "</span>";
      
        // Show the filename first, then the URL in grey if it is different than the filename
        matchList +=
          "<li style='width:1000em'>" +
            (filename == "" ? url : unescape( filename )) +
            (filename == url ? "" : span) +
          "</li>";
      }
    }
    
    // Finally, display the template with our substitutions
    pblock.innerHTML = CmdUtils.renderTemplate(template, {
      "pattern": pattern.html,
      "dest": folderHtml,
      "list": matchList
    });
  },
  execute: function(pattern, mods) {
    var folder = DownloadFiles.getFolder(mods["to"].text);
    if (folder) {
      fileUrls = DownloadFiles.matchFiles(pattern.text);
      displayMessage("Downloading " + fileUrls.length + " files to " + folder.path);

      var succeeded = 0;
      for (i in fileUrls) {
        if (DownloadFiles.downloadFile(fileUrls[i], folder)) succeeded += 1;
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
