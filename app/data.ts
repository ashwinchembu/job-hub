export type ProblemDifficulty = "Easy" | "Medium" | "Hard";

export type InterviewProblem = {
  id: number;
  title: string;
  difficulty: ProblemDifficulty;
  pattern: string;
  cue: string;
  week: number;
  day: number;
  targetMinutes: number;
  url: string;
};

const rawProblems = [
  [1, "Two Sum", "Easy", "Arrays & Hashing", "Replace the nested loop with a complement lookup."],
  [217, "Contains Duplicate", "Easy", "Arrays & Hashing", "Membership seen so far is the only state you need."],
  [242, "Valid Anagram", "Easy", "Arrays & Hashing", "Order is irrelevant; frequency is the invariant."],
  [49, "Group Anagrams", "Medium", "Arrays & Hashing", "Give each word a canonical, hashable signature."],
  [347, "Top K Frequent Elements", "Medium", "Arrays & Hashing", "Separate frequency counting from top-k selection."],
  [238, "Product of Array Except Self", "Medium", "Arrays & Hashing", "Combine a prefix contribution with a suffix contribution."],
  [128, "Longest Consecutive Sequence", "Medium", "Arrays & Hashing", "Only begin counting where a predecessor is absent."],
  [125, "Valid Palindrome", "Easy", "Two Pointers", "Move inward while skipping characters you do not compare."],
  [167, "Two Sum II", "Medium", "Two Pointers", "Sorted order tells you which boundary can improve the sum."],
  [15, "3Sum", "Medium", "Two Pointers", "Sort once, fix one value, then solve a two-pointer subproblem."],
  [11, "Container With Most Water", "Medium", "Two Pointers", "The shorter boundary limits the current area."],
  [121, "Best Time to Buy and Sell Stock", "Easy", "Sliding Window", "Track the best prior buy while scanning each possible sale."],
  [3, "Longest Substring Without Repeating Characters", "Medium", "Sliding Window", "Define exactly when the current window violates uniqueness."],
  [424, "Longest Repeating Character Replacement", "Medium", "Sliding Window", "Window size minus its dominant count is the replacement cost."],
  [20, "Valid Parentheses", "Easy", "Stack", "The latest unmatched opener must close first."],
  [155, "Min Stack", "Medium", "Stack / Design", "Every push must preserve enough minimum history to undo it."],
  [150, "Evaluate Reverse Polish Notation", "Medium", "Stack", "An operator consumes the two most recent operands in order."],
  [739, "Daily Temperatures", "Medium", "Monotonic Stack", "Keep unresolved indices in decreasing-temperature order."],
  [206, "Reverse Linked List", "Easy", "Linked List", "Save the remaining list before changing the current link."],
  [21, "Merge Two Sorted Lists", "Easy", "Linked List", "A dummy head removes the first-node special case."],
  [143, "Reorder List", "Medium", "Linked List", "Decompose the work into midpoint, reverse, and merge."],
  [704, "Binary Search", "Easy", "Binary Search", "Choose one interval convention and preserve it."],
  [33, "Search in Rotated Sorted Array", "Medium", "Binary Search", "At least one half remains normally sorted."],
  [153, "Find Minimum in Rotated Sorted Array", "Medium", "Binary Search", "Use the last value to locate the rotation break."],
  [875, "Koko Eating Bananas", "Medium", "Binary Search on Answer", "Write a monotonic can-finish predicate first."],
  [56, "Merge Intervals", "Medium", "Intervals", "After sorting, only the latest merged interval can overlap next."],
  [57, "Insert Interval", "Medium", "Intervals", "Process ranges before, overlapping, and after the insertion."],
  [435, "Non-overlapping Intervals", "Medium", "Greedy / Intervals", "Keeping the earliest ending interval leaves the most room."],
  [226, "Invert Binary Tree", "Easy", "Trees / DFS", "Apply the same local swap at every node."],
  [104, "Maximum Depth of Binary Tree", "Easy", "Trees / DFS", "A node returns one plus its deeper child."],
  [543, "Diameter of Binary Tree", "Easy", "Trees / DFS", "Return height while updating a separate best path."],
  [110, "Balanced Binary Tree", "Easy", "Trees / DFS", "Use a sentinel to propagate an unbalanced subtree."],
  [100, "Same Tree", "Easy", "Trees / DFS", "Handle null structure before comparing values."],
  [102, "Binary Tree Level Order Traversal", "Medium", "Trees / BFS", "The current queue length defines one complete level."],
  [98, "Validate Binary Search Tree", "Medium", "Trees / DFS", "Pass inherited lower and upper bounds down the tree."],
  [235, "Lowest Common Ancestor of a BST", "Medium", "Trees / BST", "Walk until the targets split around the current value."],
  [230, "Kth Smallest Element in a BST", "Medium", "Trees / BST", "Inorder traversal emits values in sorted order."],
  [199, "Binary Tree Right Side View", "Medium", "Trees / BFS", "Each breadth level contributes one selected node."],
  [1448, "Count Good Nodes in Binary Tree", "Medium", "Trees / DFS", "Carry the maximum seen along the current path."],
  [105, "Construct Tree from Preorder and Inorder", "Medium", "Trees / Recursion", "Preorder chooses roots; inorder divides subtrees."],
  [208, "Implement Trie", "Medium", "Trie / Design", "Each character advances through a shared prefix path."],
  [211, "Design Add and Search Words", "Medium", "Trie / Backtracking", "A wildcard branches across all children at one position."],
  [215, "Kth Largest Element in an Array", "Medium", "Heap / Selection", "A size-k min-heap keeps only the candidates you need."],
  [973, "K Closest Points to Origin", "Medium", "Heap", "Squared distance is enough for ordering."],
  [621, "Task Scheduler", "Medium", "Greedy / Heap", "The most frequent task creates the scheduling pressure."],
  [295, "Find Median from Data Stream", "Hard", "Two Heaps / Design", "Keep balanced lower and upper halves."],
  [55, "Jump Game", "Medium", "Greedy", "Only the farthest reachable boundary matters."],
  [134, "Gas Station", "Medium", "Greedy", "Separate global feasibility from the current start candidate."],
  [846, "Hand of Straights", "Medium", "Greedy / Ordered Map", "Always start a group from the smallest remaining value."],
  [200, "Number of Islands", "Medium", "Graphs / Grid DFS", "Each unvisited land cell starts one component traversal."],
  [133, "Clone Graph", "Medium", "Graphs / DFS", "Map original nodes to clones before exploring neighbors."],
  [695, "Max Area of Island", "Medium", "Graphs / Grid DFS", "Let one traversal own marking and area accumulation."],
  [994, "Rotting Oranges", "Medium", "Graphs / Multi-source BFS", "Queue every initial source before expanding by layers."],
  [417, "Pacific Atlantic Water Flow", "Medium", "Graphs / Reverse Search", "Search inward from each destination boundary, then intersect."],
  [207, "Course Schedule", "Medium", "Graphs / Topological Sort", "A full topological ordering exists only without a cycle."],
  [684, "Redundant Connection", "Medium", "Union Find", "An edge is redundant when its endpoints are already connected."],
  [210, "Course Schedule II", "Medium", "Graphs / Topological Sort", "Process zero-indegree nodes and verify the output size."],
  [721, "Accounts Merge", "Medium", "Graphs / Union Find", "Shared identifiers create connections between records."],
  [743, "Network Delay Time", "Medium", "Graphs / Dijkstra", "Expand the currently cheapest known path first."],
  [787, "Cheapest Flights Within K Stops", "Medium", "Graphs / Bounded Path", "State includes both location and edges used."],
  [1584, "Min Cost to Connect All Points", "Medium", "Graphs / MST", "This is a minimum spanning tree, not a single-source path."],
  [127, "Word Ladder", "Hard", "Graphs / BFS", "Words are implicit nodes; BFS finds the fewest transformations."],
  [130, "Surrounded Regions", "Medium", "Graphs / Boundary DFS", "Mark boundary-connected cells as safe first."],
  [78, "Subsets", "Medium", "Backtracking", "At each index, choose whether to include the current value."],
  [39, "Combination Sum", "Medium", "Backtracking", "The start index controls order and duplicate generation."],
  [46, "Permutations", "Medium", "Backtracking", "Each level selects one unused item and restores it afterward."],
  [17, "Letter Combinations of a Phone Number", "Medium", "Backtracking", "Each input position contributes one mapped choice."],
  [79, "Word Search", "Medium", "Backtracking / Grid", "The state includes position, word index, and path-visited cells."],
  [131, "Palindrome Partitioning", "Medium", "Backtracking", "Each level chooses the next valid palindromic prefix."],
  [51, "N-Queens", "Hard", "Backtracking", "Columns and two diagonal identities define conflicts."],
  [70, "Climbing Stairs", "Easy", "1-D Dynamic Programming", "The final move comes from one of two smaller states."],
  [198, "House Robber", "Medium", "1-D Dynamic Programming", "Choose between skipping and taking plus the best two steps back."],
  [322, "Coin Change", "Medium", "Dynamic Programming", "Build each amount from one smaller reachable amount."],
  [300, "Longest Increasing Subsequence", "Medium", "DP / Binary Search", "A tails array stores the smallest ending value per length."],
  [1143, "Longest Common Subsequence", "Medium", "2-D Dynamic Programming", "Define the state over prefixes of both strings."],
  [62, "Unique Paths", "Medium", "2-D Dynamic Programming", "Each cell combines paths arriving from above and left."],
  [91, "Decode Ways", "Medium", "1-D Dynamic Programming", "Check valid one-digit and two-digit extensions."],
  [175, "Combine Two Tables", "Easy", "SQL / Join", "Preserve primary rows even when the secondary match is missing."],
  [181, "Employees Earning More Than Their Managers", "Easy", "SQL / Self Join", "Alias one table as both employee and manager."],
  [176, "Second Highest Salary", "Medium", "SQL / Ranking", "Handle duplicates and the missing-second case."],
  [184, "Department Highest Salary", "Medium", "SQL / Groupwise Max", "Partition the maximum by department and retain ties."],
  [146, "LRU Cache", "Medium", "Hash Map / Doubly Linked List", "A map finds nodes while a list preserves recency."],
  [981, "Time Based Key-Value Store", "Medium", "Hash Map / Binary Search", "Each key owns an ordered timestamp history."],
  [42, "Trapping Rain Water", "Hard", "Two Pointers / Final Mock", "Water is bounded by the smaller best wall from either side."],
] as const satisfies ReadonlyArray<readonly [number, string, ProblemDifficulty, string, string]>;

export const weekThemes = [
  "Arrays & Hashing",
  "Two Pointers & Sliding Window",
  "Stacks & Linked Lists",
  "Binary Search & Intervals",
  "Trees: Core Traversals",
  "Trees, BSTs & Tries",
  "Heaps & Greedy",
  "Graphs: Traversal & Connectivity",
  "Graphs: Ordering & Paths",
  "Backtracking",
  "Dynamic Programming",
  "SQL, Backend Design & Final Mock",
];

export const interviewPlan: InterviewProblem[] = rawProblems.map(
  ([id, title, difficulty, pattern, cue], index) => ({
    id,
    title,
    difficulty,
    pattern,
    cue,
    day: index + 1,
    week: Math.floor(index / 7) + 1,
    targetMinutes: difficulty === "Easy" ? 30 : difficulty === "Medium" ? 45 : 60,
    url: `https://leetcode.com/problems/${title
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}/description/`,
  }),
);

const urlOverrides: Record<number, string> = {
  167: "two-sum-ii-input-array-is-sorted",
  235: "lowest-common-ancestor-of-a-binary-search-tree",
  105: "construct-binary-tree-from-preorder-and-inorder-traversal",
  208: "implement-trie-prefix-tree",
  211: "design-add-and-search-words-data-structure",
  787: "cheapest-flights-within-k-stops",
  1584: "min-cost-to-connect-all-points",
  17: "letter-combinations-of-a-phone-number",
  1143: "longest-common-subsequence",
  181: "employees-earning-more-than-their-managers",
  184: "department-highest-salary",
  981: "time-based-key-value-store",
};

for (const problem of interviewPlan) {
  if (urlOverrides[problem.id]) {
    problem.url = `https://leetcode.com/problems/${urlOverrides[problem.id]}/description/`;
  }
}
