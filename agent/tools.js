export const tools = [
  {
    type: "function",
    name: "search_swaps",
    description:
      "Search OpenSwap's database for open-source alternatives to a specified product or a one word software category tag.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Only the name of the product being replaced or a one word software category tag. Do not include any requirements or other words.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "check_health",
    description:
      "Check the maintenance health of a project. Use this to verify if a suggested alternative is actively maintained.",
    parameters: {
      type: "object",
      properties: {
        project_name: {
          type: "string",
          description:
            "A project name. Examples: 'Mumble' or 'Strapi'.",
        },
      },
      required: ["project_name"],
      additionalProperties: false,
    },
    strict: true,
  },
];
