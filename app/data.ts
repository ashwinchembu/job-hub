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
  blind75: boolean;
};

export const BLIND_75_TOTAL = 75;

const blind75ProblemIds = new Set([
  1, 217, 347, 238, 128, 15, 11, 121, 39, 57, 56, 435, 252, 253, 268,
  242, 49, 271, 125, 3, 424, 76, 5, 647, 20, 48, 54, 73, 153, 33, 206,
  21, 141, 143, 19, 23, 226, 104, 100, 572, 102, 105, 124, 297, 235, 98,
  230, 208, 211, 212, 295, 79, 200, 133, 417, 207, 323, 261, 269, 70, 198,
  213, 91, 322, 152, 139, 300, 62, 55, 377, 53, 191, 338, 190, 371,
]);

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
  [252, "Meeting Rooms", "Easy", "Intervals", "Sort by start time and compare each meeting with the previous end."],
  [253, "Meeting Rooms II", "Medium", "Intervals / Heap", "Track the earliest room release while meetings arrive in start-time order."],
  [268, "Missing Number", "Easy", "Arrays / Bit Manipulation", "Every paired value cancels when indices and values share one XOR chain."],
  [271, "Encode and Decode Strings", "Medium", "Strings / Design", "Prefix every string with an unambiguous length before its contents."],
  [76, "Minimum Window Substring", "Hard", "Sliding Window", "Shrink only after the window covers every required character count."],
  [5, "Longest Palindromic Substring", "Medium", "Strings / Expand Around Center", "Every palindrome grows from either one center or a gap between two centers."],
  [647, "Palindromic Substrings", "Medium", "Strings / Expand Around Center", "Count every successful expansion instead of retaining only the longest one."],
  [48, "Rotate Image", "Medium", "Matrix", "Transpose the matrix, then reverse each row in place."],
  [54, "Spiral Matrix", "Medium", "Matrix / Simulation", "Consume one boundary at a time and re-check that rows and columns remain."],
  [73, "Set Matrix Zeroes", "Medium", "Matrix / In-place Markers", "Reuse the first row and column as marker storage without losing their original state."],
  [141, "Linked List Cycle", "Easy", "Linked List / Fast & Slow Pointers", "A fast pointer eventually laps a slow pointer exactly when a cycle exists."],
  [19, "Remove Nth Node From End of List", "Medium", "Linked List / Two Pointers", "Keep a fixed gap so the trailing pointer stops before the node to remove."],
  [23, "Merge k Sorted Lists", "Hard", "Linked List / Heap", "Only the smallest current head from each list needs to compete."],
  [572, "Subtree of Another Tree", "Easy", "Trees / DFS", "At each matching root candidate, verify the complete tree structure and values."],
  [124, "Binary Tree Maximum Path Sum", "Hard", "Trees / DFS", "Return one usable branch upward while recording a two-branch path locally."],
  [297, "Serialize and Deserialize Binary Tree", "Hard", "Trees / Design", "Preserve null children so traversal values reconstruct one unambiguous shape."],
  [212, "Word Search II", "Hard", "Trie / Backtracking", "Share prefixes in a trie so one board traversal can reject many words at once."],
  [323, "Number of Connected Components in an Undirected Graph", "Medium", "Graphs / Connectivity", "Every unvisited node starts exactly one component traversal."],
  [261, "Graph Valid Tree", "Medium", "Graphs / Union Find", "A tree has one component, no cycle, and exactly n minus one edges."],
  [269, "Alien Dictionary", "Hard", "Graphs / Topological Sort", "The first differing character in adjacent words creates one ordering edge."],
  [213, "House Robber II", "Medium", "Dynamic Programming", "Break the cycle into two linear robberies that exclude opposite endpoints."],
  [152, "Maximum Product Subarray", "Medium", "Dynamic Programming", "Track both maximum and minimum products because a negative can swap their roles."],
  [139, "Word Break", "Medium", "Dynamic Programming", "A prefix is reachable when an earlier reachable prefix ends with a dictionary word."],
  [377, "Combination Sum IV", "Medium", "Dynamic Programming", "Count ordered ways to build each target from smaller totals."],
  [53, "Maximum Subarray", "Medium", "Dynamic Programming / Kadane", "At each value, choose between extending the prior subarray and starting fresh."],
  [191, "Number of 1 Bits", "Easy", "Bit Manipulation", "Clearing the lowest set bit makes the loop run once per one-bit."],
  [338, "Counting Bits", "Easy", "Bit Manipulation / Dynamic Programming", "Reuse the count of a smaller number after removing one known high or low bit."],
  [190, "Reverse Bits", "Easy", "Bit Manipulation", "Move one source bit at a time into the mirrored output position."],
  [371, "Sum of Two Integers", "Medium", "Bit Manipulation", "XOR adds without carries while AND identifies carries for the next position."],
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
  "Blind 75: Intervals & Strings",
  "Blind 75: Matrix & Linked Lists",
  "Blind 75: Trees, Tries & Graphs",
  "Blind 75: Dynamic Programming & Bits",
  "Blind 75: Final Bit Pattern",
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
    blind75: blind75ProblemIds.has(id),
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
  252: "meeting-rooms",
  253: "meeting-rooms-ii",
  271: "encode-and-decode-strings",
  323: "number-of-connected-components-in-an-undirected-graph",
  269: "alien-dictionary",
};

for (const problem of interviewPlan) {
  if (urlOverrides[problem.id]) {
    problem.url = `https://leetcode.com/problems/${urlOverrides[problem.id]}/description/`;
  }
}

const missingBlind75Problems = [...blind75ProblemIds].filter(
  (id) => !interviewPlan.some((problem) => problem.id === id),
);

if (blind75ProblemIds.size !== BLIND_75_TOTAL || missingBlind75Problems.length > 0) {
  throw new Error(
    `Blind 75 coverage is invalid: ${blind75ProblemIds.size} canonical IDs, ${missingBlind75Problems.length} missing from the plan.`,
  );
}

export const blind75CoverageCount = interviewPlan.filter((problem) => problem.blind75).length;
