import content from './lessons.json' with { type: 'json' };

export const lessons = content;

export function lessonSummary(lesson) {
  const { nodes, startNode, ...summary } = lesson;
  return summary;
}
export function publicNode(lesson, nodeId) {
  const node = lesson.nodes[nodeId];
  return { id: nodeId, title: node.title, text: node.text, video: node.video,
    kind: node.kind, analysis: node.analysis, help: node.help,
    choices: node.choices.map(({ id, text }) => ({ id, text })) };
}
