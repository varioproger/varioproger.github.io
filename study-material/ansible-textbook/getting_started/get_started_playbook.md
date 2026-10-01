---
title: Creating a playbook
product: ansible
source_url: https://docs.ansible.com/ansible/latest/getting_started/get_started_playbook.html
source_path: ansible/ansible-documentation:docs/docsite/rst/getting_started/get_started_playbook.rst
---

# Creating a playbook

Playbooks are automation blueprints, in `YAML` format, that Ansible uses to deploy and configure managed nodes.

Playbook  
A list of plays that define the order in which Ansible performs operations, from top to bottom, to achieve an overall goal.

Play  
An ordered list of tasks that maps to managed nodes in an inventory.

Task  
A reference to a single module that defines the operations that Ansible performs.

Module  
A unit of code or binary that Ansible runs on managed nodes.
Ansible modules are grouped in collections with a `Fully Qualified Collection Name (FQCN)` for each module.

Complete the following steps to create a playbook that pings your hosts and prints a "Hello world" message:

1.  Create a file named `playbook.yaml` in your `ansible_quickstart` directory, that you created earlier, with the following content:

    yaml/first_playbook.yaml

2.  Run your playbook.

    ``` bash
    ansible-playbook -i inventory.ini playbook.yaml
    ```

Ansible returns the following output:

ansible_output/first_playbook_output.txt

In this output you can see:

- The names that you give the play and each task.
  You should always use descriptive names that make it easy to verify and troubleshoot playbooks.
- The "Gathering Facts" task runs implicitly.
  By default, Ansible gathers information about your inventory that it can use in the playbook.
- The status of each task.
  Each task has a status of `ok` which means it ran successfully.
- The play recap that summarizes results of all tasks in the playbook per host.
  In this example, there are three tasks so `ok=3` indicates that each task ran successfully.

Congratulations, you have started using Ansible!


> [!NOTE]
>
> See also
> [Ansible playbooks](../playbook_guide/playbooks_intro.md)
> Start building playbooks for real world scenarios.
> [Working with playbooks](../playbook_guide/playbooks.md)
> Go into more detail with Ansible playbooks.
> [Ansible tips and tricks](../tips_tricks/index.md)
> Get tips and tricks for using playbooks.
> [Discovering variables: facts and magic variables](../playbook_guide/playbooks_vars_facts.md)
> Learn more about the `gather_facts` keyword in playbooks.
