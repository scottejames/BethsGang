export interface PhraseCategory {
  id: string;
  label: string;
  hint: string;
  phrases: string[];
}

// Own wording throughout — no phrase here is copied from any external source. The
// category list (and, within a category, the general *kind* of thing academic writing
// needs a phrase for — defining a term, conceding a counterargument, hedging a claim,
// etc.) is informed by how long-established academic-writing guides carve up the same
// territory: the University of Manchester's Academic Phrasebank, Purdue OWL's
// transitional-devices guide, and Andy Gillett's UEfAP site (see README.md's "Assets"
// section for links and why we didn't just copy their text — most explicitly prohibit
// redistributing their phrases, e.g. Purdue OWL: "may not be published, reproduced,
// ... or redistributed without permission"). These sentence *functions* are standard
// across the genre, not owned by any one source; the sentences themselves are ours.
export const phraseCategories: PhraseCategory[] = [
  {
    id: 'opening',
    label: 'Opening the essay',
    hint: 'Getting the first sentence down',
    phrases: [
      'This essay examines ___ and argues that ___.',
      'In recent years, ___ has become an increasingly important issue in ___.',
      'There is ongoing debate about ___, particularly around ___.',
      'This essay will consider ___ from the perspective of ___.',
      'To understand ___, it is first necessary to consider ___.',
      'While much has been written about ___, less attention has been paid to ___.',
      'This essay sets out to answer the question: ___?',
    ],
  },
  {
    id: 'background',
    label: 'Giving background',
    hint: 'Setting up context before the main argument',
    phrases: [
      'Before addressing this question directly, it is worth outlining ___.',
      '___ was first identified by ___, who argued that ___.',
      'Historically, ___ has been understood as ___.',
      'It is widely accepted that ___.',
      'Over the past decade, ___ has attracted growing attention within ___.',
      '___ is a central concept within the study of ___.',
    ],
  },
  {
    id: 'defining',
    label: 'Defining a term',
    hint: 'Making sure a key term is clear before using it',
    phrases: [
      '___ can be defined as ___.',
      'For the purposes of this essay, ___ refers to ___.',
      'The term ___ is used here to mean ___.',
      'By ___, this essay means ___ rather than ___.',
      'There is no single agreed definition of ___; this essay adopts ___.',
    ],
  },
  {
    id: 'structure',
    label: 'Outlining essay structure',
    hint: "Telling the reader what's coming",
    phrases: [
      'This essay is structured as follows: first ___, then ___, and finally ___.',
      'The first section considers ___, before moving on to ___.',
      'This essay proceeds in three stages. First, ___. Second, ___. Finally, ___.',
      'Having outlined ___, the next section turns to ___.',
    ],
  },
  {
    id: 'thesis',
    label: 'Stating your argument',
    hint: 'Making your main claim clear',
    phrases: [
      'This essay argues that ___.',
      'The central claim of this essay is that ___.',
      'It will be argued here that ___.',
      'This essay takes the position that ___, for three main reasons.',
      'This essay contends that ___, contrary to the more common view that ___.',
    ],
  },
  {
    id: 'point',
    label: 'Introducing a point',
    hint: 'Moving on to a new idea or paragraph',
    phrases: [
      'One important factor to consider is ___.',
      'A further point worth noting is ___.',
      'Turning now to ___, it becomes clear that ___.',
      'The first, and perhaps most significant, reason is ___.',
      'Equally important is the fact that ___.',
      'Another key consideration is ___.',
    ],
  },
  {
    id: 'examples',
    label: 'Giving examples',
    hint: 'Backing up a point with a concrete case',
    phrases: [
      'This can be illustrated by the example of ___.',
      'For instance, ___.',
      'A clear example of this is ___.',
      'This is best demonstrated by ___.',
      'Consider, for example, the case of ___.',
      'Take, for instance, ___.',
    ],
  },
  {
    id: 'quantifying',
    label: 'Quantifying evidence',
    hint: 'Saying how much support a claim actually has',
    phrases: [
      'The majority of studies suggest that ___.',
      'A significant proportion of ___ show that ___.',
      'Few, if any, studies have found that ___.',
      'Only a small number of ___ dispute that ___.',
      'Most researchers in this field agree that ___.',
    ],
  },
  {
    id: 'referring',
    label: 'Referring to other work',
    hint: 'Bringing in a source or another author',
    phrases: [
      'According to ___, ___.',
      'As ___ notes, ___.',
      "___'s research suggests that ___.",
      'This is consistent with the findings of ___, who showed that ___.',
      '___ (___) found that ___.',
      'Building on this, ___ went on to argue that ___.',
    ],
  },
  {
    id: 'critical',
    label: 'Being critical',
    hint: 'Evaluating a source or weighing up an argument',
    phrases: [
      'However, this argument has been criticised on the grounds that ___.',
      'While this view has some merit, it fails to account for ___.',
      'A limitation of this approach is that ___.',
      'This claim is not without its critics; ___ has argued that ___.',
      'On closer inspection, this argument appears to overlook ___.',
      'It is questionable whether ___ actually holds true in the case of ___.',
      '___ has been challenged by more recent research, which found that ___.',
    ],
  },
  {
    id: 'comparing',
    label: 'Comparing and contrasting',
    hint: 'Setting two ideas or sources against each other',
    phrases: [
      'Unlike ___, ___ suggests that ___.',
      'In contrast to ___, ___ takes the view that ___.',
      'Both ___ and ___ agree that ___, although they differ on ___.',
      'Whereas ___ focuses on ___, ___ instead emphasises ___.',
      'Similarly, ___ also found that ___.',
      'By comparison, ___ presents a rather different picture.',
    ],
  },
  {
    id: 'conceding',
    label: 'Conceding a counterargument',
    hint: 'Acknowledging the other side before moving past it',
    phrases: [
      'It is true that ___; however, ___.',
      'Admittedly, ___. Nevertheless, ___.',
      'While there is some truth to the claim that ___, this does not fully explain ___.',
      'Critics might object that ___. This objection, however, overlooks ___.',
      'Even taking this into account, ___.',
    ],
  },
  {
    id: 'cause-effect',
    label: 'Cause and effect',
    hint: 'Linking a reason to its result',
    phrases: [
      'This has led to ___.',
      'As a result of ___, ___.',
      'One consequence of ___ is that ___.',
      '___ can be attributed to a number of factors, including ___.',
      'This, in turn, has contributed to ___.',
      'The underlying cause of ___ appears to be ___.',
    ],
  },
  {
    id: 'cautious',
    label: 'Being cautious',
    hint: "Making a claim you can't fully prove",
    phrases: [
      'It could be argued that ___.',
      'This suggests, though does not prove, that ___.',
      'The evidence, while not conclusive, points towards ___.',
      'It is possible that ___, although further research would be needed to confirm this.',
      '___ may play a role, though this remains speculative.',
      'These findings should be treated with some caution, given ___.',
    ],
  },
  {
    id: 'emphasizing',
    label: 'Emphasizing a point',
    hint: 'Making sure a key point lands',
    phrases: [
      'Crucially, ___.',
      'What is particularly striking here is that ___.',
      'It is worth emphasising that ___.',
      'Above all, ___.',
      'Perhaps most importantly, ___.',
    ],
  },
  {
    id: 'generalizing',
    label: 'Generalizing',
    hint: 'Making a broad claim, carefully',
    phrases: [
      'In general, ___.',
      'Broadly speaking, ___.',
      'As a general rule, ___, although exceptions exist.',
      'More often than not, ___.',
    ],
  },
  {
    id: 'restating',
    label: 'Restating an idea differently',
    hint: 'Saying the same thing another way for clarity',
    phrases: [
      'In other words, ___.',
      'Put differently, ___.',
      'That is to say, ___.',
      'To put it another way, ___.',
    ],
  },
  {
    id: 'summing-up',
    label: 'Summing up a point',
    hint: 'Wrapping up a paragraph before moving on',
    phrases: [
      'In short, ___.',
      'Taken together, these points suggest that ___.',
      'Overall, the evidence points towards ___.',
      'In sum, ___.',
      'What emerges from this discussion is that ___.',
    ],
  },
  {
    id: 'concluding',
    label: 'Concluding the essay',
    hint: 'Landing the final paragraph',
    phrases: [
      'In conclusion, this essay has shown that ___.',
      'To summarise, ___.',
      'Ultimately, the evidence suggests that ___.',
      'This essay has argued that ___, and that this has significant implications for ___.',
      'While questions remain about ___, it is clear that ___.',
      'Future research might usefully explore ___.',
      'What this suggests, above all, is that ___.',
    ],
  },
];
