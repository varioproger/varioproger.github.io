---
title: Working with playbooks
product: ansible
source_url: https://docs.ansible.com/ansible/latest/playbook_guide/playbooks.html
source_path: ansible/ansible-documentation:docs/docsite/rst/playbook_guide/playbooks.rst
---

# Working with playbooks

Playbooks record and execute Ansible's configuration, deployment, and orchestration functions.
They can describe a policy you want your remote systems to enforce, or a set of steps in a general IT process.

If Ansible modules are the tools in your workshop, playbooks are your instruction manuals, and your inventory of hosts is your raw material.

At a basic level, playbooks can be used to manage configurations of and deployments to remote machines.
At a more advanced level, they can sequence multi-tier rollouts involving rolling updates and can delegate actions to other hosts, interacting with monitoring servers and load balancers along the way.

Playbooks are designed to be human-readable and are developed in a basic text language.
There are multiple ways to organize playbooks and the files they include, and we'll offer up some suggestions on that and making the most out of Ansible.
