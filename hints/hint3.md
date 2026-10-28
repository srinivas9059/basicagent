If a follow-up forgets the earlier exchange, inspect the saved `contextHistory` for that conversation in `store/conversations.json`. The route loads it again on every request, so whatever isn't saved is gone by the next question.

Chats created before your change have an empty `contextHistory`. Their earlier exchanges can't come back, so test with `Private team chat alternatives` or a new chat.

If one chat seems to know another chat's requirements, inspect which conversation ID the browser sent and which record the route loaded. Check the request's actual context rather than relying on the model's wording alone.
