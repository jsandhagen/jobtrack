// Conjunctions copied from a title-cased posting belong in lower case in
// generated skill phrases. Keep acronyms (including boolean AND), product
// names, and the candidate's historical job titles as written.
function phraseCasing(text) {
  return String(text || '').replace(/\b(?:And|aNd|anD|ANd|AnD)\b/g, (word, at) => at ? 'and' : word);
}

module.exports = { phraseCasing };
