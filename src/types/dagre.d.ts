declare module 'dagre' {
  export namespace graphlib {
    class Graph {
      constructor(opts?: { directed?: boolean; multigraph?: boolean; compound?: boolean });
      setGraph(label: Record<string, any>): this;
      setDefaultEdgeLabel(labelFn: () => Record<string, any>): this;
      setNode(name: string, label: Record<string, any>): this;
      setEdge(v: string, w: string, label?: Record<string, any>): this;
      node(name: string): { x: number; y: number; width: number; height: number };
      graph(): Record<string, any>;
    }
  }
  export function layout(graph: graphlib.Graph): void;
}
