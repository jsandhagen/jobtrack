// Explicitly hypothetical portfolio scenarios demonstrate a work sample,
// not completed employment, acquisitions, headcount or business results.
function isFictionalSample(doc) {
  return !!doc && /(?:entirely fictional|fictional (?:scenario|case|project)|hypothetical (?:scenario|case|project)|created solely as a work sample)/i.test(String(doc.text || '').slice(0, 2000));
}

function isEvidenceDoc(doc) {
  return !!doc && doc.kind !== 'writing-sample' && !isFictionalSample(doc);
}

module.exports = { isFictionalSample, isEvidenceDoc };
