type ToDo = {
  id: number;
  title: string;
  description?: string;
  status: "pending" | "in-progress" | "completed";
  createdAt: Date;
  updatedAt: Date;
};

class ToDoManager {
  constructor() {
    this.todos = [];
    this.todoCount = 0;
  }

  todos: ToDo[];
  todoCount: number;

  addTodo(todo: ToDo) {
    this.todos.push(todo);
    this.todoCount++;
    return this.todoCount;
  }

  getTodo(id: number) {
    return this.todos.find((todo) => todo.id === id);
  }

  updateTodo(id: number, todo: ToDo) {
    const index = this.todos.findIndex((todo) => todo.id === id);
    this.todos[index] = todo;
    return this.todos[index];
  }

  deleteTodo(id: number) {
    const index = this.todos.findIndex((todo) => todo.id === id);
    this.todos.splice(index, 1);
    this.todoCount--;
    return this.todoCount;
  }

  getTodos() {
    return this.todos;
  }

  getTodoCount() {
    return this.todoCount;
  }

  clearTodos() {
    this.todos = [];
    this.todoCount = 0;
    return this.todoCount;
  }
}
