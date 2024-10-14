let wordCount = {}; // Object to track word frequency
let synonymCache = {}; // Cache for synonyms to avoid redundant API calls

function setup() {
  noCanvas(); // We're not using the canvas

  // Create a contenteditable div to act as the text editor
  let editor = createDiv();
  editor.id('editor');
  editor.attribute('contenteditable', 'true');
  editor.attribute('spellcheck', 'false');

  // Optionally, set focus to the editor on load
  editor.elt.focus();

  // Listen for keydown events to detect "Enter" key presses
  editor.elt.addEventListener('keydown', handleKeyDown);

  // Listen for input changes in the editor
  editor.elt.addEventListener('input', handleInput);
}

function handleKeyDown(event) {
  // Check if the 'Enter' key is pressed
  if (event.key === 'Enter') {
    event.preventDefault(); // Prevent the default behavior of the Enter key

    let editor = document.getElementById('editor');

    // Save cursor position using a marker
    let selection = window.getSelection();
    if (selection.rangeCount === 0) return;
    let range = selection.getRangeAt(0);
    let marker = document.createElement('span');
    marker.id = 'cursor-marker';
    range.insertNode(marker);

    // Insert a line break (<br>) after the marker
    let brNode = document.createElement('br');
    marker.parentNode.insertBefore(brNode, marker.nextSibling);

    // Remove the marker
    marker.parentNode.removeChild(marker);

    // Move the cursor to the position after the <br>
    let newRange = document.createRange();
    newRange.setStartAfter(brNode);
    newRange.collapse(true);

    selection.removeAllRanges();
    selection.addRange(newRange);
  }
}

function handleInput() {
  let editor = document.getElementById('editor');

  // Save cursor position using a marker
  let selection = window.getSelection();
  if (selection.rangeCount === 0) return;
  let range = selection.getRangeAt(0);
  let marker = document.createElement('span');
  marker.id = 'cursor-marker';
  range.insertNode(marker);

  // Get the content including the marker
  let content = editor.innerHTML;

  // Remove the marker from the DOM temporarily
  marker.parentNode.removeChild(marker);

  // Split content into words, tags, spaces, and line breaks
  let words = content.split(/(<br\s*\/?>|<[^>]+>|\s+)/i);

  // Reset word count object
  wordCount = {};

  // Create an array to hold promises for fetching synonyms
  let synonymPromises = [];

  // Collect unique words for which we need to fetch synonyms
  let uniqueWords = new Set();

  // First pass: Update word count and collect unique words
  words.forEach(word => {
    if (word && !word.match(/^<[^>]+>$/) && !word.match(/^\s+$/)) {
      let strippedWord = word.replace(/<[^>]*>/g, '').trim().toLowerCase();
      if (strippedWord !== '') {
        wordCount[strippedWord] = (wordCount[strippedWord] || 0) + 1;
        if (!synonymCache[strippedWord]) {
          uniqueWords.add(strippedWord);
        }
      }
    }
  });

  // Fetch synonyms for unique words
  uniqueWords.forEach(word => {
    let promise = fetchSynonyms(word).then(synonyms => {
      synonymCache[word] = synonyms;
    });
    synonymPromises.push(promise);
  });

  // Once all synonyms are fetched, update the editor content
  Promise.all(synonymPromises).then(() => {
    updateTextWithBlur(editor, words);

    // Restore cursor position using the marker
    let newMarker = document.getElementById('cursor-marker');
    if (newMarker) {
      let newRange = document.createRange();
      newRange.setStartAfter(newMarker);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
      newMarker.parentNode.removeChild(newMarker);
    }
  });
}

// Function to fetch synonyms using Datamuse API
function fetchSynonyms(word) {
  // Check if synonyms are already cached
  if (synonymCache[word]) {
    return Promise.resolve(synonymCache[word]);
  }

  let url = `https://api.datamuse.com/words?ml=${encodeURIComponent(word)}`;

  return fetch(url)
    .then(response => response.json())
    .then(data => {
      let synonyms = data.map(item => item.word.toLowerCase());
      return synonyms;
    })
    .catch(error => {
      console.error('Error fetching synonyms:', error);
      return [];
    });
}

function updateTextWithBlur(editor, words) {
  editor.innerHTML = ''; // Clear the editor content

  // Object to keep track of cumulative counts (word + synonyms)
  let cumulativeCounts = {};

  // Process words in order
  words.forEach(word => {
    if (word.trim() !== '') {
      if (word.match(/^<br\s*\/?>$/i)) {
        // It's a line break
        editor.appendChild(document.createElement('br'));
      } else if (word.match(/^<[^>]+>$/)) {
        // It's an HTML tag
        if (word.includes('id="cursor-marker"')) {
          // It's the cursor marker, re-insert it
          let marker = document.createElement('span');
          marker.id = 'cursor-marker';
          editor.appendChild(marker);
        } else {
          let tempDiv = document.createElement('div');
          tempDiv.innerHTML = word;
          while (tempDiv.firstChild) {
            editor.appendChild(tempDiv.firstChild);
          }
        }
      } else if (word.match(/^\s+$/)) {
        // It's whitespace
        editor.appendChild(document.createTextNode(word));
      } else {
        // It's a word
        let span = document.createElement('span');
        let strippedWord = word.replace(/<[^>]*>/g, '').trim().toLowerCase();

        // Calculate total count including synonyms
        let totalCount = wordCount[strippedWord] || 0;

        let synonyms = synonymCache[strippedWord] || [];

        synonyms.forEach(synonym => {
          if (wordCount[synonym]) {
            totalCount += wordCount[synonym];
          }
        });

        // Apply the blurring effect based on total count
        let blurAmount = (totalCount - 1) * 1.5; // Adjust the multiplier as needed
        span.style.filter = `blur(${blurAmount}px)`;
        span.innerText = word;
        editor.appendChild(span);
      }
    } else {
      // Preserve empty strings (like spaces)
      editor.appendChild(document.createTextNode(word));
    }
  });
}
