A model response has `output_text` to show and `output` to keep. Return the same pair from a whole run: the answer text, and the context history the next request continues from. A run can finish with a normal answer or with the extra request after its turn budget, so both paths need to return that same shape.

Once `runAgent` returns an object, check every place in the route that still uses its result. The saved chat history expects `swapAgentResponse` to be text, so it should still be one of the fields you get back.
