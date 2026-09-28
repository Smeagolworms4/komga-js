Regeneration of the differential fixtures (run from this directory):
  node corpus.mjs && ../../../../../tools/jshell-komga.sh -q tokens.jsh && gzip -9 -c tokens-java.json > ../analyzer-tokens.json.gz
  node searchcorpus.mjs && ../../../../../tools/jshell-komga.sh -q search.jsh && gzip -9 -c search-java.json > ../search-results.json.gz
(intermediate *.json files are not kept)
