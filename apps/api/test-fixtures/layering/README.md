Deliberately illegal import graphs. `layering.test.ts` cruises this tree with the
real rule set and asserts every rule reports its violation, so a rule that stops
working cannot pass unnoticed. Nothing here is compiled or shipped.
